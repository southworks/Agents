using Microsoft.Agents.Builder;
using Microsoft.Agents.Core.Models;
using Microsoft.AspNetCore.Http;
using System.Threading;
using System.Threading.Tasks;

namespace GenesysHandoff.Genesys
{
    public interface IGenesysService
    {
        Task SendMessageToGenesysAsync(IActivity activity, string mcsConversationId, CancellationToken cancellationToken);

        Task RetrieveMessageFromGenesysAsync(HttpRequest request, IChannelAdapter channelAdapter, CancellationToken cancellationToken);
    }
}
