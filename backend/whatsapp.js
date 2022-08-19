import { existsSync, unlinkSync, readdir } from 'fs'
import { join } from 'path'
import makeWASocket, {
    makeWALegacySocket,
    useSingleFileAuthState,
    useSingleFileLegacyAuthState,
    makeInMemoryStore,
    Browsers,
    DisconnectReason,
    delay,
} from '@adiwajshing/baileys'
import { toDataURL } from 'qrcode'
import __dirname from './dirname.js'
import response from './response.js'
import { getMessages, responseMessages, requestApi } from './controller_data/flows.js'


const sessions = new Map()
const retries = new Map()

const sessionsDir = (sessionId = '') => {
    return join(__dirname, 'sessions', sessionId ? `${sessionId}.json` : '')
}

const isSessionExists = (sessionId) => {
    return sessions.has(sessionId)
}

const isSessionFileExists = (name) => {
    return existsSync(sessionsDir(name))
}

const shouldReconnect = (sessionId) => {
    let maxRetries = parseInt(process.env.MAX_RETRIES ?? 0)
    let attempts = retries.get(sessionId) ?? 0

    maxRetries = maxRetries < 1 ? 1 : maxRetries

    if (attempts < maxRetries) {
        ++attempts

        console.log('Reconnecting...', { attempts, sessionId })
        retries.set(sessionId, attempts)

        return true
    }

    return false
}

const createSession = async (sessionId, isLegacy = false, res = null) => {
    const sessionFile = (isLegacy ? 'legacy_' : 'md_') + sessionId

    const store = makeInMemoryStore({})
    const { state, saveState } = isLegacy
        ? useSingleFileLegacyAuthState(sessionsDir(sessionFile))
        : useSingleFileAuthState(sessionsDir(sessionFile))

    /**
     * @type {(import('@adiwajshing/baileys').LegacySocketConfig|import('@adiwajshing/baileys').SocketConfig)}
     */
    const waConfig = {
        auth: state,
        printQRInTerminal: true,
        browser: Browsers.ubuntu('Chrome'),
    }

    /**
     * @type {import('@adiwajshing/baileys').AnyWASocket}
     */
    const wa = isLegacy ? makeWALegacySocket(waConfig) : makeWASocket.default(waConfig)

    if (!isLegacy) {
        store.readFromFile(sessionsDir(`${sessionId}_store`))
        store.bind(wa.ev)
    }

    sessions.set(sessionId, { ...wa, store, isLegacy })

    wa.ev.on('creds.update', saveState)

    wa.ev.on('chats.set', ({ chats }) => {
        if (isLegacy) {
            store.chats.insertIfAbsent(...chats)
        }
    })

    wa.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]

        if (m.type === 'notify') {
            console.log("mensaje recibido ---")
            console.log(msg)
            console.log("--- mensaje recibido")
            if (!msg.key.fromMe && msg.message?.buttonsResponseMessage) {
                console.log(msg.message.buttonsResponseMessage.selectedButtonId);
                const response = await requestApi(msg.key.remoteJid, msg.message.buttonsResponseMessage.selectedButtonId);
                await wa.sendMessage(msg.key.remoteJid, response.replyMessage);
            } else if (!msg.key.fromMe && msg.message.conversation) {

                await wa.sendMessage(msg.key.remoteJid, { text: 'oh hello there' })
                await wa.sendMessage(
                    msg.key.remoteJid,
                    { location: { degreesLatitude: 24.121231, degreesLongitude: 55.1121221 } }
                )
                await wa.sendMessage(msg.key.remoteJid, {
                    image: {
                        "url": "https://jiapaz-pagos.gob.mx/pagos_jiapaz/assets/img/recibo_ejemplo.png"
                    }
                })
                /*const step = await getMessages(msg.message.conversation.toLowerCase());
                if (step) {
                    const response = await responseMessages(step, msg.message.conversation.toLowerCase());
                    console.log(`response: ${response}`);
                    await wa.sendMessage(msg.key.remoteJid, response.replyMessage);
                }*/
            } else if (!msg.key.fromMe && msg.message.listResponseMessage) {
                console.log(msg.message.listResponseMessage.singleSelectReply.selectedRowId);
                const response = await requestApi(msg.key.remoteJid, msg.message.listResponseMessage.singleSelectReply.selectedRowId);
                await wa.sendMessage(msg.key.remoteJid, response.replyMessage);
            }

        }
    })

    wa.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        const statusCode = lastDisconnect?.error?.output?.statusCode

        if (connection === 'open') {
            retries.delete(sessionId)
        }

        if (connection === 'close') {
            if (statusCode === DisconnectReason.loggedOut || !shouldReconnect(sessionId)) {
                if (res && !res.headersSent) {
                    response(res, 500, false, 'Unable to create session.')
                }

                return deleteSession(sessionId, isLegacy)
            }

            setTimeout(
                () => {
                    createSession(sessionId, isLegacy, res)
                },
                statusCode === DisconnectReason.restartRequired ? 0 : parseInt(process.env.RECONNECT_INTERVAL ?? 0)
            )
        }

        if (update.qr) {
            if (res && !res.headersSent) {
                try {
                    const qr = await toDataURL(update.qr)

                    response(res, 200, true, 'QR code received, please scan the QR code.', { qr })
                } catch {
                    response(res, 500, false, 'Unable to create QR code.')
                }

                return
            }

            try {
                await wa.logout()
            } catch {
            } finally {
                deleteSession(sessionId, isLegacy)
            }
        }
    })
}

/**
 * @returns {(import('@adiwajshing/baileys').AnyWASocket|null)}
 */
const getSession = (sessionId) => {
    return sessions.get(sessionId) ?? null
}

const deleteSession = (sessionId, isLegacy = false) => {
    const sessionFile = (isLegacy ? 'legacy_' : 'md_') + sessionId
    const storeFile = `${sessionId}_store`

    if (isSessionFileExists(sessionFile)) {
        unlinkSync(sessionsDir(sessionFile))
    }

    if (isSessionFileExists(storeFile)) {
        unlinkSync(sessionsDir(storeFile))
    }

    sessions.delete(sessionId)
    retries.delete(sessionId)
}

const getChatList = (sessionId, isGroup = false) => {
    const filter = isGroup ? '@g.us' : '@s.whatsapp.net'

    return getSession(sessionId).store.chats.filter((chat) => {
        return chat.id.endsWith(filter)
    })
}

/**
 * @param {import('@adiwajshing/baileys').AnyWASocket} session
 */
const isExists = async (session, jid, isGroup = false) => {
    try {
        let result

        if (isGroup) {
            result = await session.groupMetadata(jid)

            return Boolean(result.id)
        }

        if (session.isLegacy) {
            result = await session.onWhatsApp(jid)
        } else {
            ;[result] = await session.onWhatsApp(jid)
        }

        return result.exists
    } catch {
        return false
    }
}

/**
 * @param {import('@adiwajshing/baileys').AnyWASocket} session
 */
const sendMessage = async (session, receiver, message) => {
    try {
        await delay(1000)

        return session.sendMessage(receiver, message)
    } catch {
        return Promise.reject(null) // eslint-disable-line prefer-promise-reject-errors
    }
}

const formatPhone = (phone) => {
    if (phone.endsWith('@s.whatsapp.net')) {
        return phone
    }

    let formatted = phone.replace(/\D/g, '')

    return (formatted += '@s.whatsapp.net')
}

const formatGroup = (group) => {
    if (group.endsWith('@g.us')) {
        return group
    }

    let formatted = group.replace(/[^\d-]/g, '')

    return (formatted += '@g.us')
}

const cleanup = () => {
    console.log('Running cleanup before exit.')

    sessions.forEach((session, sessionId) => {
        if (!session.isLegacy) {
            session.store.writeToFile(sessionsDir(`${sessionId}_store`))
        }
    })
}

const init = () => {
    readdir(sessionsDir(), (err, files) => {
        if (err) {
            throw err
        }

        for (const file of files) {
            if (
                !file.endsWith('.json') ||
                (!file.startsWith('md_') && !file.startsWith('legacy_')) ||
                file.includes('_store')
            ) {
                continue
            }

            const filename = file.replace('.json', '')
            const isLegacy = filename.split('_', 1)[0] !== 'md'
            const sessionId = filename.substring(isLegacy ? 7 : 3)

            createSession(sessionId, isLegacy)
        }
    })
}

export {
    isSessionExists,
    createSession,
    getSession,
    deleteSession,
    getChatList,
    isExists,
    sendMessage,
    formatPhone,
    formatGroup,
    cleanup,
    init,
}
