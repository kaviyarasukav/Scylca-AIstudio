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

    let device_code, user_code, verification_uri, interval, expires_in;
    
    if (typeof res.data === 'string') {
      const parsed = new URLSearchParams(res.data);
      device_code = parsed.get('device_code');
      user_code = parsed.get('user_code');
      verification_uri = parsed.get('verification_uri');
      interval = parseInt(parsed.get('interval') || '5', 10);
      expires_in = parseInt(parsed.get('expires_in') || '900', 10);
    } else {
      ({ device_code, user_code, verification_uri, interval, expires_in } = res.data);
    }

    console.log('\n==================================================');
    console.log('GITHUB DEVICE LOGIN FLOW REQUIRED');
    console.log(`URL: ${verification_uri}`);
    console.log(`CODE: ${user_code}`);
    console.log('==================================================\n');
    console.log('Waiting for authorization...\n');

    const pollInterval = (interval || 5) * 1000;
    const expiryTime = Date.now() + (expires_in || 900) * 1000;

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

        let accessToken = null;
        let error = null;

        if (typeof tokenRes.data === 'string') {
          const parsed = new URLSearchParams(tokenRes.data);
          accessToken = parsed.get('access_token');
          error = parsed.get('error');
        } else {
          accessToken = tokenRes.data.access_token;
          error = tokenRes.data.error;
        }

        if (accessToken) {
          clearInterval(poll);
          console.log('\nAuthorization successful! Access token obtained.');
          await pushCode(accessToken);
        } else if (error) {
          if (error === 'authorization_pending') {
            process.stdout.write('.');
          } else if (error === 'slow_down') {
            // Wait
          } else {
            console.error(`\nError: ${error}`);
            clearInterval(poll);
            process.exit(1);
          }
        }
      } catch (e) {
        // Suppress network errors during polling
      }
    }, pollInterval);

  } catch (err) {
    console.error('Failed to start device flow:', err.message);
  }
}

async function pushCode(token) {
  const repo = { fs, dir };
  console.log('\nPushing changes to GitHub remote (origin)...');
  
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
          console.error('\nAuthentication rejected by GitHub. Canceling push to avoid infinite loop.');
          return { cancel: true };
        }
        return { username: 'x-access-token', password: token };
      },
    });
    console.log('\nPush completed successfully!', pushResult);
    
    // Clean up files
    try {
      fs.unlinkSync(path.join(dir, 'final-push.cjs'));
    } catch(e) {}
    
    console.log('All done!');
    process.exit(0);
  } catch (err) {
    console.error('\nPush failed:', err.message);
    process.exit(1);
  }
}

startDeviceFlow();
