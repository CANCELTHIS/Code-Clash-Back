const axios = require('axios');

class CodeEvaluationService {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  }

  async evaluateCode(code, testCases, language, challenge) {
    if (!this.apiKey) {
      return { results: [{ passed: true, output: 'No API key' }], score: 1 };
    }

    try {
      const prompt = `Check if this code does what the task asks:

Task: ${challenge}
Code: ${code}

Does the code complete the task correctly? Answer with JSON:
{"passed": true/false, "reason": "explanation"}`;

      const response = await axios.post(this.baseURL, {
        contents: [{ parts: [{ text: prompt }] }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': this.apiKey
        }
      });

      const aiResponse = response.data.candidates[0].content.parts[0].text;
      const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
      
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          results: [{
            passed: result.passed,
            output: result.reason,
            expected: 'Task completed correctly'
          }],
          score: result.passed ? 1 : 0
        };
      }
    } catch (error) {
      console.error('AI evaluation failed:', error);
    }

    return {
      results: [{ passed: false, output: 'Evaluation failed' }],
      score: 0
    };
  }
}

module.exports = new CodeEvaluationService();