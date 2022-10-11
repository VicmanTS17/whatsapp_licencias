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
            /*await wa.sendMessage(msg.key.remoteJid, {
                image: { url: 'https://jiapaz-pagos.gob.mx/pagos_jiapaz/assets/img/recibo_ejemplo.png' }
            })*/
            console.log("mensaje recibido ---")
            console.log(msg)
            console.log("--- mensaje recibido")
            if (!msg.key.fromMe && msg.message.conversation) {
                const mensaje = msg.message.conversation.toLowerCase();
                const telefono = msg.key.remoteJid;
                const step = await getMessages(mensaje);
                console.log(step);
                if (mensaje == '51' || mensaje == '52' || mensaje == '53' || mensaje == '54' || mensaje == '55' || mensaje == '56') {
                    const response = await requestApi(telefono, mensaje, 'requisitos');
                    console.log(response);
                    await wa.sendMessage(telefono, response.replyMessage);
                } else if (step == 'CONSULTA') {
                    const response = await requestApi(telefono, mensaje);
                    console.log(response);
                    console.log(response.length);
                    if (response.length >= 1) {
                        if (mensaje === "3") {
                            await wa.sendMessage(telefono, { "text": "Reenvíanos una de estas opciones para consultar cuando te toca el 💧💧 Agua 💧💧" });
                        } else if (mensaje === "4") {
                            await wa.sendMessage(telefono, { "text": "Reenvíanos una de estas opciones para consultar el 💲💲 Saldo 💲💲" });
                        }
                        response.map(async (inmueble) => {
                            console.log(inmueble.ALIAS);
                            let mensaje_cont = "";
                            if (mensaje === "2") {
                                mensaje_cont = `Inmueble ${inmueble.ALIAS}`
                            } else if (mensaje === "3") {
                                mensaje_cont = `Tandeo :${inmueble.ALIAS}`
                            } else if (mensaje === "4") {
                                mensaje_cont = `Saldo :${inmueble.ALIAS}`
                            }
                            await wa.sendMessage(telefono, { text: mensaje_cont });
                        });
                    } else {
                        await wa.sendMessage(telefono, response.replyMessage);
                    }
                } else if (step == 'TANDEO') {
                    //await wa.sendMessage(telefono, { text: 'consultaremos el tandeo' });
                    const response = await requestApi(telefono, mensaje, 'tandeo');
                    console.log(response);
                    await wa.sendMessage(telefono, response.replyMessage);
                } else if (step == 'SALDO') {
                    //await wa.sendMessage(telefono, { text: 'consultaremos el saldo' });
                    const response = await requestApi(telefono, mensaje, 'saldo');
                    console.log(response);
                    await wa.sendMessage(telefono, response.replyMessage);
                } else if (step) {
                    const response = await responseMessages(step, mensaje);
                    console.log(response);
                    await wa.sendMessage(telefono, response.replyMessage);
                } else {
                    await wa.sendMessage(telefono, { text: 'No se encontro esa opción' });
                }
            } else if (!msg.key.fromMe && msg.message.extendedTextMessage) {
                const mensaje = msg.message.extendedTextMessage.text.toLowerCase();
                const telefono = msg.key.remoteJid;
                const step = await getMessages(mensaje);
                console.log(step);
                if (step == 'CONSULTA') {
                    const response = await requestApi(telefono, mensaje);
                    console.log(response);
                    console.log(response.length);
                    if (response.length >= 1) {
                        if (mensaje === "3") {
                            await wa.sendMessage(telefono, { "text": "Reenvíanos una de estas opciones para consultar cuando te toca el 💧💧 Agua 💧💧" });
                        } else if (mensaje === "4") {
                            await wa.sendMessage(telefono, { "text": "Reenvíanos una de estas opciones para consultar el 💲💲 Saldo 💲💲" });
                        }
                        response.map(async (inmueble) => {
                            console.log(inmueble.ALIAS);
                            let mensaje_cont = "";
                            if (mensaje === "2") {
                                mensaje_cont = `Inmueble ${inmueble.ALIAS}`
                            } else if (mensaje === "3") {
                                mensaje_cont = `Tandeo :${inmueble.ALIAS}`
                            } else if (mensaje === "4") {
                                mensaje_cont = `Saldo :${inmueble.ALIAS}`
                            }
                            await wa.sendMessage(telefono, { text: mensaje_cont });
                        });
                    } else {
                        await wa.sendMessage(telefono, response.replyMessage);
                    }
                } else if (step == 'TANDEO') {
                    //await wa.sendMessage(telefono, { text: 'consultaremos el tandeo' });
                    const response = await requestApi(telefono, mensaje, 'tandeo');
                    console.log(response);
                    await wa.sendMessage(telefono, response.replyMessage);
                } else if (step == 'SALDO') {
                    //await wa.sendMessage(telefono, { text: 'consultaremos el saldo' });
                    const response = await requestApi(telefono, mensaje, 'saldo');
                    console.log(response);
                    await wa.sendMessage(telefono, response.replyMessage);
                } else if (step) {
                    const response = await responseMessages(step, mensaje);
                    console.log(response);
                    await wa.sendMessage(telefono, response.replyMessage);
                } else {
                    await wa.sendMessage(telefono, { text: 'No se encontro esa opción' });
                }
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
