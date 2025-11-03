# Agentic Identity with the M365 Agents SDK

# Agentic Users and Terms
To create an AI Teammate who works alongside humans, Microsoft introduced few key concepts like Agent Blueprint (AB), Agent Identity (AI), Agentic User (AU). Agentic Users are autonomous agents that want to behave like user accounts.

**Agentic User** is an identity for an autonomous agent that acts like a user to access resources. Each agentic user is tied to a particular agent instance "parent", and from there to a specific Agent ID Blueprint. Agentic users support the features of normal user accounts -- they can have mailboxes and participate in chats, etc., with some small restrictions for security.

**Agent ID Blueprint** is an application that holds the business logic and orchestration for an agent and has the ability to create and manage agent identities. These agent identities are tied to their parent Agent ID Blueprint and can only be managed by that specific Blueprint. 

[TODO - Confirm] This value will match the Agent ID configured in the Azure Bot Sevice.

**Agent Identity** is an app-like identity, derived from service principal that represents an autonomous agent. An Agent ID Blueprint can get tokens for its child Agent Identities through FIC impersonation. Agent Identities are single tenant, created in the tenant where the Agent ID Blueprint is installed, but a given Agent ID Blueprint can create and manage multiple Agent Identities within a single tenant.

**Agentic Instance ID**

**Agentic Instance Token**

# Sample Agentic Agents 

# Agentic Configuration Settings
## Python
## C#
## Javascript

# Common Configuration Errors

## context.identity is required for agentic activities

## Missing MSAL Configuration

## Missing Agent Instance ID

## Agentic user not configured

## IAgenticTokenProvider Not Found

# Common MSAL Errors

## Failed to obtain token

## Undefined Agent Application Instance ID

## Failed to acquire agentic instance token

## Failed to acquire token

## Agent application instance Id and agentic user Id must be provided

## Failed to acquire token for client - no payload

## Unable to retrieve agentic user token

# Appendix - Linking to this document. 
This document is deep linked from the M365 Agents SDK. When errors / exceptions are generated, those exceptions contains aka.ms links that deep link into the sections here. 

This means the names used in the section headers are fragile. The algorithm for deeplinking into a GitHub document is:
1. Identify the Header ID: GitHub automatically generates an ID for each header in a Markdown file. This ID is derived from the header text by lowercasing it, replacing spaces with hyphens, and removing special characters.
    * For a header like `# My Section`, the ID would be my-section
    * For a header like `## Another Great Section!`, the ID would be another-great-section.
1. Construct the Link: Use standard Markdown link syntax with the header ID as the destination, prefixed by a hash (#).