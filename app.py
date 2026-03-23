"""
TomatoScan — Pomidor kasalliklarini aniqlash tizimi
Muallif: Amirov Islombek | Andijon davlat universiteti
AI: OpenRouter (Bepul)
"""

import os
import base64
import json
import re
import io
import requests
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024

ALLOWED = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif'}

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "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")


def detect_media_type(data: bytes, filename: str = "") -> str:
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'gif': 'image/gif', 'webp': 'image/webp'}.get(ext, 'image/jpeg')


def to_supported(data: bytes, media_type: str):
    supported = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
    if media_type in supported:
        return data, media_type
    img = Image.open(io.BytesIO(data))
    img = img.convert('RGBA' if img.mode in ('RGBA', 'LA', 'P') else 'RGB')
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return buf.getvalue(), 'image/png'


def run_ai(img_bytes: bytes, media_type: str) -> dict:
    img_bytes, media_type = to_supported(img_bytes, media_type)
    b64 = base64.standard_b64encode(img_bytes).decode()

    prompt = """Sen pomidor o'simliklarining kasalliklarini aniqlashga ixtisoslashgan agronomy mutaxassisisin.
Rasmni diqqat bilan tahlil qilib FAQAT JSON formatda javob ber. Boshqa hech narsa yozma.

{
  "status": "disease|healthy|unknown",
  "disease_uz": "Kasallik nomi o'zbekcha",
  "disease_en": "Disease name English",
  "confidence": 85,
  "severity": "low|medium|high",
  "description": "Kasallik haqida batafsil 2-3 gapli malumot",
  "symptoms": ["1-alomat", "2-alomat", "3-alomat"],
  "causes": "Kasallik sabablari",
  "spread": "Qanday tarqaladi",
  "treatment": ["1-qadam", "2-qadam", "3-qadam", "4-qadam"],
  "medicines": [
    {
      "name": "Dori nomi",
      "type": "Fungicid|Baktericid|Insektitsid|Organik",
      "active_ingredient": "Faol modda",
      "dose": "Miqdori va qollash usuli",
      "frequency": "Qanchalik qollanadi",
      "caution": "Ehtiyot choralari"
    }
  ],
  "prevention": ["1-tavsiya", "2-tavsiya", "3-tavsiya"],
  "economic_loss": "Iqtisodiy zarar haqida qisqacha",
  "urgency": "Shoshilinch harakatlar",
  "similar_diseases": ["Uxshash kasallik 1", "Uxshash kasallik 2"]
}

QOIDALAR:
- Pomidor bargi EMAS: status=unknown
- Soglom barg: status=healthy
- Kasallik: status=disease
- FAQAT JSON, boshqa hech narsa yozma"""

    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://tomatoscan.onrender.com",
            "X-Title": "TomatoScan"
        },
        json={
            "model": "meta-llama/llama-3.2-11b-vision-instruct:free",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{b64}"
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ]
        },
        timeout=60
    )

    if response.status_code != 200:
        raise ValueError(f"API xatosi: {response.status_code} - {response.text}")

    raw = response.json()["choices"][0]["message"]["content"]
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        raise ValueError("AI dan notogri javob keldi")
    return json.loads(m.group())


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'Rasm yuklanmadi'}), 400
        f = request.files['image']
        if not f.filename:
            return jsonify({'error': 'Fayl tanlanmadi'}), 400
        ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
        if ext not in ALLOWED:
            return jsonify({'error': f'Format qollab-quvvatlanmaydi: .{ext}'}), 400
        data = f.read()
        mtype = detect_media_type(data, f.filename)
        result = run_ai(data, mtype)
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/analyze-base64', methods=['POST'])
def analyze_base64():
    try:
        body = request.get_json()
        if not body or 'image' not in body:
            return jsonify({'error': 'Rasm topilmadi'}), 400
        img_data = body['image']
        if ',' in img_data:
            header, b64 = img_data.split(',', 1)
            m = re.search(r'data:([^;]+);', header)
            mtype = m.group(1) if m else 'image/jpeg'
        else:
            b64, mtype = img_data, 'image/jpeg'
        raw_bytes = base64.b64decode(b64)
        detected = detect_media_type(raw_bytes)
        if detected != 'image/jpeg':
            mtype = detected
        result = run_ai(raw_bytes, mtype)
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'service': 'TomatoScan'})


if __name__ == '__main__':
    print("=" * 55)
    print("TomatoScan ishga tushdi!")
    print("http://localhost:5000")
    print("=" * 55)
    app.run(debug=True, host='0.0.0.0', port=5000)
