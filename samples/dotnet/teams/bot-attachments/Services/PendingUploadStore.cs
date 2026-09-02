// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Concurrent;

namespace Microsoft.Teams.Samples.BotAttachments.Services;

public sealed class PendingUploadStore
{
    private readonly ConcurrentDictionary<string, byte[]> _uploads = new();

    public void Add(string fileId, byte[] content)
    {
        _uploads[fileId] = content;
    }

    public bool TryTake(string fileId, out byte[] content)
    {
        return _uploads.TryRemove(fileId, out content!);
    }

    public void Remove(string fileId)
    {
        _uploads.TryRemove(fileId, out _);
    }
}
