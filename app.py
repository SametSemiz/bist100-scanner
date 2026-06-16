# pyrefly: ignore [missing-import]
from flask import Flask, render_template, request, jsonify
from scanner import scan_bist100

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/scan', methods=['POST'])
def run_scan():
    try:
        data = request.json
        timeframe = data.get('timeframe', '1d')
        chunk = data.get('chunk', 'all')
        
        results = scan_bist100(timeframe, chunk)
        
        if "error" in results:
            return jsonify({"status": "error", "message": results["error"]}), 500
            
        return jsonify({
            "status": "success",
            "data": results
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
