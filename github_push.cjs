const fs = require('fs');
const { execSync } = require('child_process');

const clientId = '178c6fc778ccc68e1d6a';
const deviceCode = '1c8e8a6dc8e6a95c39b32476ec99434a52a93edb';

async function poll() {
    while (true) {
        await new Promise(r => setTimeout(r, 5000));
        
        try {
            const resp = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    client_id: clientId,
                    device_code: deviceCode,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                })
            });
            const data = await resp.json();
            
            if (data.access_token) {
                console.log('Got token!');
                const token = data.access_token;
                
                // Add git to PATH just in case
                process.env.PATH += ';C:\\Users\\23aiml29\\AppData\\Local\\Programs\\Git\\cmd';
                
                // git config
                try { execSync('git config user.name "Antigravity"', { stdio: 'ignore' }); } catch(e){}
                try { execSync('git config user.email "bot@example.com"', { stdio: 'ignore' }); } catch(e){}
                
                execSync('git add .', { stdio: 'inherit' });
                try {
                    execSync('git commit -m "Auto push entire code"', { stdio: 'inherit' });
                } catch(e) {
                    console.log('Nothing to commit');
                }
                
                try { execSync('git remote remove origin', { stdio: 'ignore' }); } catch(e){}
                execSync(`git remote add origin https://oauth2:${token}@github.com/kaviyarasukav/Scylca.git`, { stdio: 'inherit' });
                execSync('git branch -M main', { stdio: 'inherit' });
                execSync('git push -u origin main --force', { stdio: 'inherit' });
                
                console.log('Successfully pushed!');
                break;
            } else if (data.error === 'authorization_pending') {
                console.log('Authorization pending...');
            } else if (data.error === 'expired_token') {
                console.log('Token expired.');
                break;
            } else {
                console.log('Error:', data);
            }
        } catch (e) {
            console.error('Fetch error:', e);
        }
    }
}

poll();
