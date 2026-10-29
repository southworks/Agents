// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { randomUUID } from 'node:crypto'
import { Activity } from '@microsoft/agents-activity'
import { AgentApplication, MemoryStorage } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '@microsoft/agents-hosting-extensions-msteams'
import { downloadAttachment, uploadToOneDrive } from './files.js'

interface FileContext {
  filename?: string
  file_id?: string
}

export function createAgent (services: {
  download?: typeof downloadAttachment
  upload?: typeof uploadToOneDrive
} = {}) {
  const download = services.download ?? downloadAttachment
  const upload = services.upload ?? uploadToOneDrive
  const pendingUploads = new Map<string, Buffer>()
  const app = new AgentApplication({ storage: new MemoryStorage() })
  const teams = new TeamsAgentExtension(app)
  app.registerExtension(teams, (extension) => {
    extension.fileConsent.onAccept(async (context, _state, consent) => {
      const details = (consent.context ?? {}) as FileContext
      const id = details.file_id ?? ''
      const content = pendingUploads.get(id)
      pendingUploads.delete(id)
      if (!content || !consent.uploadInfo?.uploadUrl) {
        await context.sendActivity('The pending file is unavailable. Send the file again to request consent.')
        return
      }
      await context.sendActivity(`Accepted. Uploading <b>${details.filename}</b>...`)
      try {
        await upload(consent.uploadInfo.uploadUrl, content)
        await context.sendActivity(Activity.fromObject({
          type: 'message',
          text: `<b>${consent.uploadInfo.name}</b> has been successfully uploaded.`,
          attachments: [{
            contentType: 'application/vnd.microsoft.teams.card.file.info',
            name: consent.uploadInfo.name,
            contentUrl: consent.uploadInfo.contentUrl,
            content: { uniqueId: consent.uploadInfo.uniqueId, fileType: consent.uploadInfo.fileType },
          }],
        }))
      } catch (error) {
        console.error('File upload failed:', error)
      }
    })
    extension.fileConsent.onDecline(async (context, _state, consent) => {
      const details = (consent.context ?? {}) as FileContext
      pendingUploads.delete(details.file_id ?? '')
      await context.sendActivity(`Declined. We won't upload file <b>${details.filename}</b>.`)
    })
  })
  app.onActivity('message', async (context) => {
    const attachment = context.activity.attachments?.[0]
    if (attachment?.contentType !== 'application/vnd.microsoft.teams.file.download.info' || !attachment.name) {
      await context.sendActivity('Welcome to the Bot Attachments sample!')
      return
    }
    const info = attachment.content as { downloadUrl?: string }
    if (!info.downloadUrl) {
      throw new Error('Teams file attachment did not include a download URL')
    }
    const content = await download(info.downloadUrl)
    const id = randomUUID()
    pendingUploads.set(id, content)
    const consentContext = { filename: attachment.name, file_id: id }
    await context.sendActivity(`Received <b>${attachment.name}</b>. Requesting permission to save to your OneDrive...`)
    await context.sendActivity(Activity.fromObject({
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.teams.card.file.consent',
        name: attachment.name,
        content: {
          description: 'This is the file I want to send you',
          sizeInBytes: content.length,
          acceptContext: consentContext,
          declineContext: consentContext,
        },
      }],
    }))
  })
  return app
}
