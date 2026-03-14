const apiKey = process.env.VITE_OPENROUTER1_API_KEY;
fetch('http://alb-r3li6yh4ktpwq7ugkg.ap-southeast-1.alb.aliyuncsslbintl.com:7000/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [{ role: 'user', content: 'hello' }]
    })
}).then(res => res.text()).then(console.log).catch(console.error);
