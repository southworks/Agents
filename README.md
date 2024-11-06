# Agents Framework

The Microsoft Agent Framework simplifies building full stack, multichannel, trusted agents. It's a comprehensive framework for building enterprise-grade agents, enabling developers to leverage key components from the Azure AI Foundry SDK, Semantic Kernel, Copilot Studio, as well as AI components from other vendors. It provides developers with the building blocks to create agents that handle user interactions, orchestrate requests, reason responses, and collaborate with other agents. These agents can operate across platforms like Teams, Microsoft 365, Slack, Messenger, Web, and more.

* **Agent Framework SDK**. Provides agent composition and user experience capabilities. Developers can deploy agents to channels for human interaction. This component handles conversation management and enables the agent to access orchestration and core agent backend functionality. In addition, this component enables agents to access functionality from Copilot Studio agents and the Copilot trust layer.

* **Semantic Kernel SDK**. Provides orchestration capabilities for single and multi-agent developments. It acts as middleware, enabling developers to automate business processes by combining AI prompts with existing APIs.

* **Azure AI Foundry SDK**. Provides the core backend agent functionality, providing reasoning, retrieval augmentation, observability, among other core functions. Developers can leverage the Azure AI Agent Service or build their agent functionality with individual components from this SDK. 

The Agents Framework brings together core components to allow for developers to create, manage and utilize various AI Services and third-party SDKs to power orchestration and develop custom agent logic functionality.

The source for the client libraries exists for the most part in repositories for each language. This repository is meant to be a jumping off point into those language specific repositories. Issues related to a specific language should be opened in the corresponding repository but cross cutting issues can be opened in this repository.

| Language    | Repo                             | Documentation                    |
|:------------|:--------------------------------:|:--------------------------------:|
| General     |[agents Repository]               | [Official Agents Documentation]   |
| C# /.NET    |[agents-for-net Repository]       | [.NET Documentation]             |
| JavaScript  |[agents-for-js Repository]        | [JavaScript Documentation]       |
| Python      |Coming Soon    | Coming Soon           |

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