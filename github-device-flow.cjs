const axios = require('axios');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = '178c6fc778ccc68e1d6a'; 
const dir = __dirname;

async function startDeviceFlow() {
  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('scope', 'repo');

    const res = await axios.post('https://github.com/login/device/code', params, {
      headers: { 
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { device_code, user_code, verification_uri, interval, expires_in } = res.data;

    console.log('\n==================================================');
    console.log('GITHUB DEVICE LOGIN FLOW REQUIRED');
    console.log(`URL: ${verification_uri}`);
    console.log(`CODE: ${user_code}`);
    console.log('==================================================\n');
    console.log('Waiting for authorization...');

    const pollInterval = (interval || 5) * 1000;
    const expiryTime = Date.now() + (expires_in || 900) * 1000;

    let attempts = 0;
    const poll = setInterval(async () => {
      if (Date.now() > expiryTime) {
        console.error('\nSession expired. Please try again.');
        clearInterval(poll);
        process.exit(1);
      }

      try {
        const tokenParams = new URLSearchParams();
        tokenParams.append('client_id', CLIENT_ID);
        tokenParams.append('device_code', device_code);
        tokenParams.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

        const tokenRes = await axios.post('https://github.com/login/oauth/access_token', tokenParams, {
          headers: { 
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        if (tokenRes.data.access_token) {
          clearInterval(poll);
          console.log('\nAuthorization successful!');
          const token = tokenRes.data.access_token;
          fs.writeFileSync(path.join(dir, 'token.txt'), token);
          console.log('Token securely acquired. Starting push...');
          await pushCode(token);
        } else if (tokenRes.data.error) {
          const err = tokenRes.data.error;
          if (err === 'authorization_pending') {
            process.stdout.write('.');
          } else if (err === 'slow_down') {
            // Wait
          } else {
            console.error(`\nError: ${tokenRes.data.error_description || err}`);
            clearInterval(poll);
            process.exit(1);
          }
        }
      } catch (e) {
        console.error('\nPolling error:', e.message);
      }
    }, pollInterval);

  } catch (err) {
    console.error('Failed to start device flow:', err.response ? err.response.data : err.message);
  }
}

async function pushCode(token) {
  const repo = { fs, dir };
  console.log('Pushing changes to GitHub remote (origin)...');
  
  let authAttempts = 0;
  
  try {
    const pushResult = await git.push({
      ...repo,
      http,
      remote: 'origin',
      ref: 'main',
      onAuth: (url, auth) => {
        authAttempts++;
        if (authAttempts > 1) {
          console.error('Authentication rejected by GitHub. Canceling push to avoid infinite loop.');
          return { cancel: true };
        }
        return { username: 'x-access-token', password: token };
      },
    });
    console.log('Push completed successfully!', pushResult);
    
    // Clean up files
    try {
      fs.unlinkSync(path.join(dir, 'github-device-flow.cjs'));
      fs.unlinkSync(path.join(dir, 'push-code.cjs'));
      fs.unlinkSync(path.join(dir, 'git-push-server.cjs'));
      fs.unlinkSync(path.join(dir, 'token.txt'));
    } catch(e) {}
    
    console.log('All done. Cleaned up helper scripts.');
    process.exit(0);
  } catch (err) {
    console.error('Push failed:', err.message);
    process.exit(1);
  }
}

startDeviceFlow();
