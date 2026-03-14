import { getModelsByScenario, ScenarioType } from './services/aiImageGeneration';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We need an accessToken. I'll just write a raw fetch.
async function main() {
    const res = await fetch('https://story.neodomain.cn/agent/ai-image-generation/models/by-scenario?scenarioType=5', {
        headers: {
            'accessToken': process.env.VITE_TEST_ACCESS_TOKEN || '' 
        }
    });
    console.log(await res.json());
}
main();
