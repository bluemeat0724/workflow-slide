call model
```nodejs
import OpenAI from "openai";

const openai = new OpenAI({
        baseURL: process.env.OPENAI_API_BASE,
        apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: "You are a helpful assistant." }],
    model: "deepseek-v4-pro",
    thinking: {"type": "enabled"},
    reasoning_effort: "high",
    stream: false,
  });

  console.log(completion.choices[0].message.content);
}

main();
```

对话前缀续写：在workflow 主agent 完成与用户的沟通，确认流程构建需求后 交由子agent，调用如下方式 创建json数据用于生成workflow
# user should set `baseURL="https://api.deepseek.com/beta"` to use this feature.
```nodejs
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "<your api key>",
  baseURL: "https://api.deepseek.com/beta",
});

const messages = [
  { role: "user", content: "Please write quick sort code" },
  { role: "assistant", content: "```json\n", prefix: true }
];

async function getCompletion() {
  try {
    const response = await client.chat.completions.create({
      model: "deepseek-v4-flash",
      messages: messages,
      stop: ["```"],
    });
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error("Error:", error);
  }
}
```