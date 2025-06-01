import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from flask import Flask, send_from_directory
import subprocess
import threading
import time

app = Flask(__name__)

# Start Node.js server in a separate thread
def start_node_server():
    subprocess.Popen(['node', 'server.js'], cwd=os.path.dirname(os.path.abspath(__file__)))

# Start the Node.js server when Flask starts
@app.before_first_request
def before_first_request():
    thread = threading.Thread(target=start_node_server)
    thread.daemon = True
    thread.start()
    # Give Node.js server time to start
    time.sleep(5)

# Serve static files from the public directory
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public', path)):
        return send_from_directory('public', path)
    else:
        return send_from_directory('public', 'index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
