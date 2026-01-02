import os
import sys
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(__file__))

from converter.main import convert_cpp_to_python

app = Flask(__name__, static_folder='static')
# Configure CORS to allow requests from GitHub and LeetCode domains
CORS(app, origins=[
    "https://leetcode.com",
    "https://github.com",
    "chrome-extension://*"
])

@app.route('/')
def index():
    return jsonify({"message": "Welcome to the C++ to Python converter API"})

@app.route('/convert', methods=['POST'])
def convert():
    """
    Handle code conversion requests
    POST: /convert
    Expects JSON payload with "code" field containing C++ code.
    Returns JSON response with converted Python code or error messages.
    """
    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    try:
        result = convert_cpp_to_python(code)
        return jsonify({"success": True, "python": result, "errors": []})
    except Exception as e:
        return jsonify({"success": False, "python": "", "errors": [str(e)]}), 500

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files"""
    return send_from_directory(os.path.join(os.path.dirname(__file__), "static"), filename)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
