using Microsoft.Agents.Builder.State;
using Microsoft.Agents.Core.Models;
using System;

namespace GenesysHandoff.Services
{
    /// <summary>
    /// Manages conversation state properties for Genesys handoff scenarios.
    /// </summary>
    public class ConversationStateManager
    {
        private const string MCSConversationPropertyName = "MCSConversationId";
        private const string IsEscalatedPropertyName = "IsEscalated";
        private const string LastCpsActivityPropertyName = "LastCpsActivity";

        /// <summary>
        /// Gets the Copilot Studio conversation ID from the turn state.
        /// Returns null if the conversation ID has not been set.
        /// </summary>
        /// <param name="turnState">The turn state containing conversation properties.</param>
        /// <returns>The conversation ID if it exists; otherwise, null.</returns>
        public string? GetConversationId(ITurnState turnState)
        {
            ArgumentNullException.ThrowIfNull(turnState);
            return turnState.Conversation.GetValue<string>(MCSConversationPropertyName);
        }

        /// <summary>
        /// Sets the Copilot Studio conversation ID in the turn state.
        /// </summary>
        /// <param name="turnState">The turn state to update.</param>
        /// <param name="conversationId">The conversation ID to store.</param>
        /// <exception cref="ArgumentNullException">Thrown when turnState is null.</exception>
        /// <exception cref="ArgumentException">Thrown when conversationId is null or empty.</exception>
        public void SetConversationId(ITurnState turnState, string conversationId)
        {
            ArgumentNullException.ThrowIfNull(turnState);
            ArgumentException.ThrowIfNullOrEmpty(conversationId);
            turnState.Conversation.SetValue(MCSConversationPropertyName, conversationId);
        }

        /// <summary>
        /// Gets whether the conversation has been escalated to a human agent.
        /// Returns false if the escalation flag has not been set (default behavior for new conversations).
        /// </summary>
        /// <param name="turnState">The turn state containing conversation properties.</param>
        /// <returns>True if the conversation has been escalated; otherwise, false.</returns>
        public bool IsEscalated(ITurnState turnState)
        {
            ArgumentNullException.ThrowIfNull(turnState);
            // GetValue<bool> returns false (default) if the property doesn't exist,
            // which is the desired behavior for new conversations
            return turnState.Conversation.GetValue<bool>(IsEscalatedPropertyName);
        }

        /// <summary>
        /// Marks the conversation as escalated to a human agent.
        /// </summary>
        /// <param name="turnState">The turn state to update.</param>
        /// <param name="isEscalated">True to mark as escalated; false otherwise.</param>
        public void SetEscalated(ITurnState turnState, bool isEscalated)
        {
            ArgumentNullException.ThrowIfNull(turnState);
            turnState.Conversation.SetValue(IsEscalatedPropertyName, isEscalated);
        }

        /// <summary>
        /// Gets the last activity received from Copilot Studio, or <c>null</c> if none has been stored.
        /// </summary>
        /// <param name="turnState">The turn state containing conversation properties.</param>
        /// <returns>The last CPS activity if it exists; otherwise, <c>null</c>.</returns>
        public Activity? GetLastCpsActivity(ITurnState turnState)
        {
            ArgumentNullException.ThrowIfNull(turnState);
            return turnState.Conversation.GetValue<Activity>(LastCpsActivityPropertyName);
        }

        /// <summary>
        /// Stores the last activity received from Copilot Studio in conversation state.
        /// The activity is cast to <see cref="Activity"/> to ensure consistent
        /// serialization/deserialization with <see cref="GetLastCpsActivity"/>.
        /// </summary>
        /// <param name="turnState">The turn state to update.</param>
        /// <param name="activity">The activity to store.</param>
        public void SetLastCpsActivity(ITurnState turnState, IActivity activity)
        {
            ArgumentNullException.ThrowIfNull(turnState);
            ArgumentNullException.ThrowIfNull(activity);
            turnState.Conversation.SetValue(LastCpsActivityPropertyName, (Activity)activity);
        }

        /// <summary>
        /// Clears all conversation state properties managed by this class.
        /// </summary>
        /// <param name="turnState">The turn state to clear.</param>
        public void ClearConversationState(ITurnState turnState)
        {
            ArgumentNullException.ThrowIfNull(turnState);
            turnState.Conversation.DeleteValue(MCSConversationPropertyName);
            turnState.Conversation.DeleteValue(IsEscalatedPropertyName);
            turnState.Conversation.DeleteValue(LastCpsActivityPropertyName);
        }
    }
}
