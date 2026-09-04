Deploy Kimi K3 on Runpod                  

[![News icon](https://cdn.prod.website-files.com/69ce570adca53340abab8376/69f850d784bb32fd0fe992fb_news-icon.svg)

Kimi K3 is now available on Runpod



](/kimi-k3)[Skip to main content](#main)

[](/)

Product

[

Pods

On-demand GPUs, deployed across 31 global regions.

](/product/cloud-gpus)[

Serverless

Run API-based AI workloads with serverless GPU endpoints.

](/product/serverless)[

Clusters

Run multi-node GPU clusters for distributed AI workloads.

](/product/clusters)[

Hub

Deploy open-source AI models and templates on Runpod.

](/product/runpod-hub)

[

Deployments Models

Manage your or our compute from one unified control plane

](/hybrid-cloud)

Use Cases

[

Inference

Serve models in real-time with low-latency GPUs.

](/use-cases/inference)[

Agents

Deploy AI agents that run, react, and scale instantly.

](/use-cases/agents)[

Fine-Tuning

Train models faster with efficient, scalable compute.

](/use-cases/fine-tuning)[

Compute-Heavy Tasks

Process massive workloads with zero bottlenecks.

](/use-cases/compute-heavy-tasks)

Resources

[

Case Studies

Loved by leaders. But don’t just take it from us.

](/case-studies)[

Articles

In-depth perspectives, ideas, and updates from our team.

](/articles)[

Press

Company news and media coverage.

](/press)[

Blog

Our team’s insights on building better and scaling smarter.

](/blog)

Company

[

About

Redefining cloud compute with speed, scale, and innovation.

](/about)[

Partner

Bring enterprise-grade GPU infrastructure to your customers.

](/partners)[

Careers

Join our mission to build the launchpad for AI apps.

](/careers)

[Docs](https://docs.runpod.io/overview)[Pricing](/pricing)[Enterprise](/enterprise)

Contact Sales[Sign in](https://console.runpod.io/login)[Sign Up](https://console.runpod.io/deploy)

[Prefer to call? Call +1 (888) 692-1358](tel:+18886921358)

# Kimi K3 on Runpod

Moonshot AI's 2.8T-parameter open-weight model, ready to deploy in minutes. Call it through Runpod's OpenAI-compatible endpoint, or self-host it on multi-node GPUs.

[Deploy on Runpod](https://console.runpod.io/hub/playground/text/moonshot-kimi)

[View deployment guide](#deploy)

 Talk to sales about a cluster →

![Moonshot AI](https://cdn.prod.website-files.com/69ce570adca53340abab8376/6a67bb6e8c0abdbfc0f307cf_kimi-moonshot-logo.png)

### Model details

Developed byMoonshot AI

Model familyKimi

Use caseLong-horizon coding and agentic knowledge work

VersionK3

Size2.8T parameters (16 of 896 experts active)

Context1M tokens

Price$3.00 / 1M input tokens  
$15.00 / 1M output tokens

License[Kimi-K3 model license](https://huggingface.co/moonshotai/Kimi-K3)

### Example usage

Kimi K3 is available now as a Runpod Public Endpoint. It speaks the OpenAI Chat Completions format, so point your existing client at Runpod and pass model `kimi-k3`. Streaming is supported.

 

Python (OpenAI SDK) cURL (direct HTTP)

Using the OpenAI SDK pointed at Runpod's OpenAI-compatible base URL.

```
from openai import OpenAI

client = OpenAI(
    base_url="https://api.runpod.ai/v2/moonshot-kimi/openai/v1",
    api_key="RUNPOD_API_KEY",
)

resp = client.chat.completions.create(
    model="kimi-k3",
    messages=[
        {"role": "system", "content": "You are Kimi."},
        {"role": "user", "content": "Explain what makes Kimi K3 good at long-horizon coding."},
    ],
    stream=True,
)

for chunk in resp:
    print(chunk.choices[0].delta.content or "", end="")
```

A direct HTTPS request to the OpenAI-compatible endpoint.

```
curl https://api.runpod.ai/v2/moonshot-kimi/openai/v1/chat/completions \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-k3",
    "messages": [
      {"role": "user", "content": "What is Runpod?"}
    ]
  }' 
```

Example response

```
{
  "id": "chatcmpl-8f3a2b",
  "object": "chat.completion",
  "model": "kimi-k3",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Runpod is an AI developer cloud for building, training, and serving models on GPUs."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 12, "completion_tokens": 18, "total_tokens": 30 }
}
```

Request flow

### How a Kimi K3 request flows on Runpod

Point your OpenAI client at the Runpod endpoint, Runpod routes the call to Kimi K3, and tokens stream back to your app.

POST /chat/completionsmodel: kimi-k3stream: trueClientOpenAI SDKRunpod endpointOpenAI-compatibleKimi K3Public EndpointStreamed tokens

## Deploy your own Kimi K3 cluster

Kimi K3 is a 2.8T-parameter model with a total footprint around 1.56TB of VRAM, so it runs across multiple GPUs rather than a single card. Pick a supported deployment shape below and bring a day-0 serving recipe. Larger clusters work too, these are supported starting points, not hard limits.

Supported deployment shapes on Runpod

B200 2x8

H100 4x8

B300 1x8

H200 2x8

Talk to sales about your cluster

Deciding whether to self-host?[Read the technical FAQ →](/articles/guides/kimi-k3-technical-faq)

Day-0 serving recipes are available for vLLM and SGLang.

[vLLM recipe](https://recipes.vllm.ai/moonshotai/Kimi-K3) [SGLang recipe](https://docs.sglang.io/cookbook/autoregressive/Moonshotai/Kimi-K3)

```
# Day-0 vLLM image for Kimi K3
docker pull vllm/vllm-openai:kimi-k3

# Day-0 SGLang image for Kimi K3
docker pull lmsysorg/sglang:kimi-k3

# Serve command: follow the day-0 recipe for the exact flags.
```

SGLang reports 423 tokens per second for Kimi K3 on DSpark. This is SGLang's reported figure, not a Runpod-measured benchmark.

## Related models

[

### Kimi K2.6

Default Kimi endpoint for reasoning and chat.

$0.95 / 1M input tokens  
$4.00 / 1M output tokens](https://console.runpod.io/hub)[

### Kimi K2.7 Code

Tuned for coding and agentic workflows.

$0.95 / 1M input tokens  
$4.00 / 1M output tokens](https://console.runpod.io/hub)

## Build what’s next.

Build, train, and scale AI workloads on Runpod with cloud GPUs, Serverless, and Clusters.

[Get started](https://console.runpod.io/deploy)

Request a demo

![Star field background](https://cdn.prod.website-files.com/69ce570adca53340abab8376/69df3777f96b96b86ab03b85_Background%20Stars.svg)

[

329 Bryant St #4D  
San Francisco, CA 94107

](/)

Product

*   [
    
    Cloud GPUs
    
    ](/product/cloud-gpus)
*   [
    
    Serverless
    
    POPULAR
    
    
    
    ](/product/serverless)
*   [
    
    Clusters
    
    ](/product/clusters)
*   [
    
    Hub
    
    ](/product/runpod-hub)

Use Cases

*   [
    
    Inference
    
    ](/use-cases/inference)
*   [
    
    Fine-Tuning
    
    ](/use-cases/fine-tuning)
*   [
    
    Agents
    
    ](/use-cases/agents)
*   [
    
    Compute-Heavy Tasks
    
    ](/use-cases/compute-heavy-tasks)

Resources

*   [
    
    Blog
    
    ](/blog)
*   [
    
    Product updates
    
    ](https://docs.runpod.io/release-notes)
*   [
    
    Press
    
    ](/press)
*   [
    
    GPU Benchmarks
    
    ](/gpu-compare)
*   [
    
    Models Directory
    
    ](/models)
*   [
    
    Referral Program
    
    ](/referral-and-affiliate-program)
*   [
    
    Brandkit
    
    ](/brandkit)
*   [
    
    Articles
    
    ](/articles)
*   [
    
    Pricing
    
    ](/pricing)
*   [
    
    Case Studies
    
    ](/case-studies)
*   [
    
    Startup Program
    
    ](/startup-program)
*   [
    
    Docs
    
    ](https://docs.runpod.io/overview)

Company

*   [
    
    About
    
    ](/about)
*   [
    
    Partners
    
    ](/partners)
*   [
    
    Contact
    
    ](/contact)
*   [
    
    Call +1 (888) 692-1358
    
    ](tel:+18886921358)
*   [
    
    Careers
    
    ](/careers)

Make infrastructure our job, so it doesn't have to be yours.

Thank you! Your submission has been received!

Oops! Something went wrong while submitting the form.

[

All systems operational

](https://uptime.runpod.io)

[

](https://github.com/runpod)[

](https://discord.com/invite/cUpRmau42V)[

](https://x.com/runpod)[

](https://www.linkedin.com/company/runpod-io/)

© 2026 Runpod Inc.

[Terms of Service](/legal/terms-of-service)[Privacy Policy](/legal/privacy-policy)[Cookie Policy](/legal/cookie-policy)[Compliance](/legal/