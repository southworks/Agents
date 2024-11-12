# Microsoft 365 Agents SDK

The Microsoft 365 Agent SDK simplifies building full stack, multichannel, trusted agents for platforms including M365, Teams, Copilot Studio, and Webchat. We also offer integrations with 3rd parties such as Facebook Messenger, Slack, or Twilio. The SDK provides developers with the building blocks to create agents that handle user interactions, orchestrate requests, reason responses, and collaborate with other agents.

The M365 Agent SDK is a comprehensive framework for building enterprise-grade agents, enabling developers to integrate components from the Azure AI Foundry SDK, Semantic Kernel, as well as AI components from other vendors.
 
* **Microsoft 365 Agents SDK Overview**. Provides agent composition and user experience capabilities. Developers can deploy agents to channels for human interaction. This component handles conversation management and enables the agent to access orchestration and core agent backend functionality. In addition, this component enables agents to access functionality from Copilot Studio agents and the Copilot trust layer.
* **Copilot Studio**. Copilot Studio is an end-to-end conversational AI platform that empowers the creation of agents using natural language or a graphical interface. With Copilot Studio, you can easily design, test, and publish agents that suit your needs for internal or external scenarios across your industry, department, or role.
* **Microsoft Teams**. Microsoft Teams offers a collection of apps that are provided by Microsoft or external services. Teams apps can be tabs, bots, or message extensions or any combination of the capabilities. You can extend Teams apps to work on Outlook and Microsoft 365 App, too. These apps expand the value of the Teams collaborative experience for users.

## Related SDKs

* **Semantic Kernel**. [Semantic Kernel](https://learn.microsoft.com/en-us/semantic-kernel/overview/)
is an SDK that integrates Large Language Models (LLMs) like
[OpenAI](https://platform.openai.com/docs/introduction),
[Azure OpenAI](https://azure.microsoft.com/en-us/products/ai-services/openai-service),
and [Hugging Face](https://huggingface.co/)
with conventional programming languages like C#, Python, and Java. Semantic Kernel achieves this
by allowing you to define [plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins)
that can be chained together
in just a [few lines of code](https://learn.microsoft.com/en-us/semantic-kernel/ai-orchestration/chaining-functions?tabs=Csharp#using-the-runasync-method-to-simplify-your-code).

* **Azure AI Foundry SDK**. Provides the core backend agent functionality, providing reasoning, retrieval augmentation, observability, among other core functions. Developers can leverage the Azure AI Agent Service or build their agent functionality with individual components from this SDK. 

The Agents Framework brings together core components to allow for developers to create, manage and utilize various AI Services and third-party SDKs to power orchestration and develop custom agent logic functionality.

## Links
The source for the client libraries exists for the most part in repositories for each language. This repository is meant to be a jumping off point into those language specific repositories. Issues related to a specific language should be opened in the corresponding repository but cross cutting issues can be opened in this repository.

| Language    | Repo                             | Documentation                    |
|:------------|:--------------------------------:|:--------------------------------:|
| General     |[agents Repository]               | [Official Agents Documentation]   |
| C# /.NET    |[agents-for-net Repository]       | [.NET Documentation]             |
| JavaScript  |[agents-for-js Repository]        | [JavaScript Documentation]       |
| Python      |Coming Soon    | Coming Soon           |

## Evolution of Bot Framework

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.

[agents Repository]: https://github.com/Microsoft/Agents
[agents-for-net Repository]: https://github.com/Microsoft/Agents-for-net
[agents-for-js Repository]: https://github.com/Microsoft/Agents-for-js
[agents-for-python Repository]: https://github.com/Microsoft/Agents-for-python

[Official Agents Documentation]: https://aka.ms/AgentsFramework
[.NET Documentation]: https://aka.ms/Agents-net-docs
[JavaScript Documentation]: https://aka.ms/agents-js-docs
[Python Documentation]: https://aka.ms/agents-python-docs
