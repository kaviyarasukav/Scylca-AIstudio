const http = require('http');
const fs = require('fs');
const path = require('path');
const git = require('isomorphic-git');
const gitHttp = require('isomorphic-git/http/node');

const dir = __dirname;
const port = 9999;

const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Scylca Git Push</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f6f8fa;
      color: #24292f;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: white;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      padding: 24px;
      width: 400px;
      box-shadow: 0 3px 6px rgba(140, 149, 159, 0.15);
    }
    h2 {
      margin-top: 0;
      font-size: 20px;
      font-weight: 600;
    }
    p {
      font-size: 14px;
      color: #57606a;
    }
    label {
      display: block;
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 14px;
    }
    input[type="password"] {
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      box-sizing: border-box;
      margin-bottom: 16px;
    }
    button {
      background-color: #2da44e;
      color: white;
      border: 1px solid rgba(27, 31, 36, 0.15);
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
    }
    button:hover {
      background-color: #2c974b;
    }
    .status {
      margin-top: 16px;
      padding: 12px;
      border-radius: 6px;
      font-size: 14px;
      display: none;
    }
    .status.success {
      background-color: #dafbe1;
      color: #1a7f37;
      border: 1px solid #aef1b9;
      display: block;
    }
    .status.error {
      background-color: #ffebe9;
      color: #cf222e;
      border: 1px solid #ffc1c0;
      display: block;
    }
    .loader {
      display: none;
      text-align: center;
      margin-top: 10px;
      font-size: 14px;
      color: #57606a;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>Push Scylca to GitHub</h2>
    <p>Repository: <strong>kaviyarasukav/Scylca</strong></p>
    <form id="pushForm">
      <label for="token">GitHub Personal Access Token (PAT)</label>
      <input type="password" id="token" placeholder="ghp_..." required />
      <button type="submit" id="submitBtn">Push Code</button>
    </form>
    <div class="loader" id="loader">Pushing code, please wait...</div>
    <div class="status" id="status"></div>
  </div>

  <script>
    document.getElementById('pushForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('token').value;
      const statusDiv = document.getElementById('status');
      const loader = document.getElementById('loader');
      const submitBtn = document.getElementById('submitBtn');

      statusDiv.className = 'status';
      statusDiv.style.display = 'none';
      loader.style.display = 'block';
      submitBtn.disabled = true;

      try {
        const res = await fetch('/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        loader.style.display = 'none';
        submitBtn.disabled = false;

        if (data.success) {
          statusDiv.textContent = 'Successfully pushed all code to GitHub!';
          statusDiv.className = 'status success';
        } else {
          statusDiv.textContent = 'Error: ' + data.message;
          statusDiv.className = 'status error';
        }
      } catch (err) {
        loader.style.display = 'none';
        submitBtn.disabled = false;
        statusDiv.textContent = 'Network error: ' + err.message;
        statusDiv.className = 'status error';
      }
    });
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else if (req.method === 'POST' && req.url === '/push') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { token } = JSON.parse(body);
        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Token is required' }));
          return;
        }

        const repo = { fs, dir };
        
        console.log('Pushing to GitHub via isomorphic-git...');
        const result = await git.push({
          ...repo,
          http: gitHttp,
          remote: 'origin',
          ref: 'main',
          onAuth: () => ({ username: 'kaviyarasukav', password: token }),
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
        
        // Gracefully shut down after a successful push
        setTimeout(() => {
          console.log('Push successful. Closing server...');
          process.exit(0);
        }, 2000);

      } catch (err) {
        console.error('Push error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(port, () => {
  console.log(`Git push portal running at http://localhost:${port}/`);
});
