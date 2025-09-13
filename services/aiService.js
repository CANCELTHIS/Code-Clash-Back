const axios = require('axios');

class AIService {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  }

  async generateTestCases(description) {
    try {
      const prompt = `Generate 3 test cases for: ${description}

Return only JSON format:
{
  "testCases": [
    {"input": "input_value", "expectedOutput": "expected_result", "description": "test description"}
  ]
}

Example for "add two numbers":
{
  "testCases": [
    {"input": "2, 3", "expectedOutput": "5", "description": "Basic addition"},
    {"input": "0, 0", "expectedOutput": "0", "description": "Zero values"},
    {"input": "-1, 1", "expectedOutput": "0", "description": "Negative numbers"}
  ]
}`;

      if (!this.apiKey || this.apiKey === 'your_google_api_key_here') {
        console.log('Using mock test cases - no API key');
        return this.generateMockTestCases(description);
      }
      
      console.log('Calling Gemini API for test cases...');

      const response = await axios.post(
        this.baseURL,
        {
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': this.apiKey
          }
        }
      );

      const generatedText = response.data.candidates[0].content.parts[0].text;
      console.log('AI Response:', generatedText);
      
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const testCasesData = JSON.parse(jsonMatch[0]);
          console.log('Parsed test cases:', testCasesData.testCases);
          return testCasesData.testCases;
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          return this.generateMockTestCases(description);
        }
      }

      console.log('No JSON found in response, using mock');
      return this.generateMockTestCases(description);

    } catch (error) {
      console.error('AI test case generation failed:', error);
      return this.generateMockTestCases(description);
    }
  }

  generateMockTestCases(description) {
    const desc = description.toLowerCase();

    if (desc.includes('adds two numbers')) {
      return [
        { input: '2, 3', expectedOutput: '5', description: 'Basic addition' },
        { input: '0, 0', expectedOutput: '0', description: 'Zero values' },
        { input: '-1, 1', expectedOutput: '0', description: 'Negative and positive' }
      ];
    } else if (desc.includes('length of a string')) {
      return [
        { input: '"hello"', expectedOutput: '5', description: 'Basic string' },
        { input: '""', expectedOutput: '0', description: 'Empty string' },
        { input: '"a"', expectedOutput: '1', description: 'Single character' }
      ];
    } else if (desc.includes('number is even')) {
      return [
        { input: '4', expectedOutput: 'true', description: 'Even number' },
        { input: '3', expectedOutput: 'false', description: 'Odd number' },
        { input: '0', expectedOutput: 'true', description: 'Zero is even' }
      ];
    } else if (desc.includes('larger of two numbers')) {
      return [
        { input: '5, 3', expectedOutput: '5', description: 'First is larger' },
        { input: '2, 8', expectedOutput: '8', description: 'Second is larger' },
        { input: '4, 4', expectedOutput: '4', description: 'Equal numbers' }
      ];
    } else if (desc.includes('multiplies a number by 2')) {
      return [
        { input: '5', expectedOutput: '10', description: 'Positive number' },
        { input: '0', expectedOutput: '0', description: 'Zero' },
        { input: '-3', expectedOutput: '-6', description: 'Negative number' }
      ];
    }

    return [
      { input: '1', expectedOutput: '1', description: 'Basic test' },
      { input: '2', expectedOutput: '2', description: 'Another test' }
    ];
  }
}

module.exports = new AIService();