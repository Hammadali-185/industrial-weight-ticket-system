/**
 * Google Drive backup for history.json (folder: saqib_silk).
 * Credentials: place google-drive-client.json in Electron userData (see getAuthUrl error text)
 * or set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in the environment.
 */
const path = require('path')
const fs = require('fs-extra')
const stream = require('stream')
const { google } = require('googleapis')

const DRIVE_FOLDER_NAME = 'saqib_silk'
const HISTORY_FILE_NAME = 'history.json'
const SCOPES = ['https://www.googleapis.com/auth/drive.file']

const CLIENT_FILENAME = 'google-drive-client.json'
const TOKEN_FILENAME = 'google-drive-tokens.json'

let oauth2Client = null

function getElectronApp() {
  return require('electron').app
}

function userDataDir() {
  return getElectronApp().getPath('userData')
}

function clientJsonPath() {
  return path.join(userDataDir(), CLIENT_FILENAME)
}

function tokenJsonPath() {
  return path.join(userDataDir(), TOKEN_FILENAME)
}

function bundledClientPath() {
  return path.join(__dirname, CLIENT_FILENAME)
}

function readCredentials() {
  if (process.env.GOOGLE_CLIENT_ID) {
    return {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    }
  }
  const paths = [clientJsonPath(), bundledClientPath()]
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf8')
        const j = JSON.parse(raw)
        if (j.client_id) return j
      } catch (e) {
        console.error('[GoogleDrive] Invalid credentials file:', p, e.message)
      }
    }
  }
  return null
}

function createOAuthClient(creds, redirectUri) {
  return new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret || '',
    redirectUri
  )
}

function initializeAuth() {
  try {
    const app = getElectronApp()
    if (!app || !app.isReady || !app.isReady()) {
      oauth2Client = null
      return
    }
  } catch {
    oauth2Client = null
    return
  }

  const creds = readCredentials()
  if (!creds || !creds.client_id) {
    oauth2Client = null
    return
  }

  // Redirect URI is only relevant during interactive auth.
  // For normal Drive API calls we just need a client + stored tokens.
  oauth2Client = createOAuthClient(creds, 'http://127.0.0.1')

  const tpath = tokenJsonPath()
  if (fs.existsSync(tpath)) {
    try {
      const tokens = JSON.parse(fs.readFileSync(tpath, 'utf8'))
      oauth2Client.setCredentials(tokens)
    } catch (e) {
      console.error('[GoogleDrive] Could not read tokens:', e.message)
    }
  }
}

function isAuthenticated() {
  if (!oauth2Client || !oauth2Client.credentials) return false
  return !!(
    oauth2Client.credentials.access_token || oauth2Client.credentials.refresh_token
  )
}

function getAuthUrl(options = {}) {
  const redirectUri = options.redirectUri
  const creds = readCredentials()
  if (!creds || !creds.client_id) {
    const hint = clientJsonPath()
    throw new Error(
      `Google Drive is not configured. Copy main/google-drive-client.example.json to:\n${hint}\n` +
        'and fill in client_id and client_secret from Google Cloud Console (OAuth desktop client).'
    )
  }

  const localClient = createOAuthClient(creds, redirectUri || 'http://127.0.0.1')
  return localClient.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

async function getTokensFromCode(code, options = {}) {
  const redirectUri = options.redirectUri
  const creds = readCredentials()
  if (!creds || !creds.client_id) {
    throw new Error('OAuth client not configured')
  }

  const localClient = createOAuthClient(creds, redirectUri || 'http://127.0.0.1')
  const { tokens } = await localClient.getToken(code.trim())
  localClient.setCredentials(tokens)

  // Update global client too (used by upload/download).
  oauth2Client = localClient
  await fs.writeFile(tokenJsonPath(), JSON.stringify(tokens, null, 2), 'utf8')
  return tokens
}

function jsonToReadable(json) {
  const buf = Buffer.from(json, 'utf8')
  const r = new stream.Readable()
  r.push(buf)
  r.push(null)
  return r
}

async function ensureFolderId(drive) {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${DRIVE_FOLDER_NAME.replace(/'/g, "\\'")}' and trashed=false`
  const list = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
  })
  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id
  }
  const created = await drive.files.create({
    requestBody: {
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })
  return created.data.id
}

async function findHistoryFileId(drive, folderId) {
  const q = `'${folderId}' in parents and name='${HISTORY_FILE_NAME.replace(/'/g, "\\'")}' and trashed=false`
  const list = await drive.files.list({
    q,
    fields: 'files(id, name)',
    spaces: 'drive',
  })
  if (!list.data.files || list.data.files.length === 0) return null
  return list.data.files[0].id
}

async function uploadHistory(historyData) {
  initializeAuth()
  if (!isAuthenticated()) {
    throw new Error('Not authenticated')
  }
  const drive = google.drive({ version: 'v3', auth: oauth2Client })
  const folderId = await ensureFolderId(drive)
  const body = JSON.stringify(historyData, null, 2)
  const media = { mimeType: 'application/json', body: jsonToReadable(body) }

  const existingId = await findHistoryFileId(drive, folderId)
  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media,
      fields: 'id, name',
    })
    return { fileId: existingId, updated: true }
  }

  const created = await drive.files.create({
    requestBody: {
      name: HISTORY_FILE_NAME,
      parents: [folderId],
    },
    media,
    fields: 'id, name',
  })
  return { fileId: created.data.id, updated: false }
}

async function downloadHistory() {
  initializeAuth()
  if (!isAuthenticated()) {
    throw new Error('Not authenticated')
  }
  const drive = google.drive({ version: 'v3', auth: oauth2Client })
  const folderId = await ensureFolderId(drive)
  const fileId = await findHistoryFileId(drive, folderId)
  if (!fileId) {
    return []
  }
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data)
  const parsed = JSON.parse(buf.toString('utf8'))
  return Array.isArray(parsed) ? parsed : []
}

async function revokeAccess() {
  initializeAuth()
  try {
    const token = oauth2Client && oauth2Client.credentials && oauth2Client.credentials.access_token
    if (token) {
      const https = require('https')
      await new Promise((resolve) => {
        const url = `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`
        https
          .get(url, (res) => {
            res.resume()
            resolve()
          })
          .on('error', () => resolve())
      })
    }
  } catch (e) {
    console.warn('[GoogleDrive] revoke token:', e.message)
  }
  try {
    if (fs.existsSync(tokenJsonPath())) {
      await fs.remove(tokenJsonPath())
    }
  } catch (e) {
    console.warn('[GoogleDrive] remove token file:', e.message)
  }
  if (oauth2Client) {
    oauth2Client.setCredentials({})
  }
  return true
}

module.exports = {
  initializeAuth,
  isAuthenticated,
  getAuthUrl,
  getTokensFromCode,
  uploadHistory,
  downloadHistory,
  revokeAccess,
}
