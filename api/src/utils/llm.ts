export async function callOpenAICompatibleAPI(
    endpoint: string,
    apiKey: string,
    model: string,
    prompt: string
): Promise<string> {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${apiKey}\`,
      'X-Title': 'Visionary Storyboard Tool (OpenClaw API)'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(\`API HTTP error: \${response.status} - \${errorText}\`);
  }

  const data: any = await response.json();
  
  if (!data?.choices?.[0]?.message?.content) {
    throw new Error('Invalid or empty response format from LLM');
  }

  return data.choices[0].message.content;
}
