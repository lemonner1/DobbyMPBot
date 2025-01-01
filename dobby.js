import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import { Markup } from 'telegraf'
import axios from 'axios'
import elements from './questions.js'
import fs from 'fs'

const progressFilePath = './based.json'
const scheduleStorm = './schedule.json'

const loadProgress = () => {
    if (fs.existsSync(progressFilePath)) {
        const data = fs.readFileSync(progressFilePath, 'utf8')
        return JSON.parse(data)
    }
    return { users: {}, completedUsers: []}
}

const saveProgress = (data) => {
    fs.writeFileSync(progressFilePath, JSON.stringify(data, null, 2))
}

const loadSchedule = () => {
    if (fs.existsSync(scheduleStorm)) {
        const data = fs.readFileSync(scheduleStorm, 'utf8')
        return JSON.parse(data)
    }
    return {}
}

const saveSchedule = (data) => {
    fs.writeFileSync(scheduleStorm, JSON.stringify(data, null, 2))
}
const schedule = loadSchedule()

// для перевода в норм формат по окончании квеста
const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
    const seconds = String(totalSeconds % 60).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
}

const progressData = loadProgress()
const initUser = (userId, username, initials) => {
    if (!progressData.users[userId]) {
        progressData.users[userId] = {
            username: username || 'Unknown',
            initials: initials,
            gender: 'сэр',
            currentElement: 0,
            lastAttempt: null,
            completed: false,
            startTime: Date.now(),
            completionTime: null,
            errors: 0,
            processing: false,
            faculty: null
        }
    }
}
saveProgress(progressData)

const bot = new Telegraf('') // insert ur bot token here
const isModerator = (userId) => progressData.moderators.includes(userId)
const moderatorState = {}
const introState = {}
const winningMessage = (from) => `<b>Браво!</b> Добби поздравляет ${progressData.users[from.id].gender == 'сэр' ? 'сэра' : 'мисс'} <b>${from.first_name}</b> с победой в <b>Турнире Трёх Волшебников</b>. 

🏆 Вы прошли все испытания! ${getMedal(progressData.completedUsers.indexOf(from.id) + 1) ? `Вы получили <b>${getMedal(progressData.completedUsers.indexOf(from.id) + 1)}</b> за ${progressData.completedUsers.indexOf(from.id) + 1}-е место!` : `Вы заняли ${progressData.completedUsers.indexOf(from.id) + 1}-е место!`}
⏱ Ваше время прохождения квеста: ${progressData.users[from.id].completionTime}
❗ Количество совершенных вами ошибок: ${progressData.users[from.id].errors} 

Пойдёмте скорее в Лавку Палумны Лавгут, которая находится вот тут совсем рядом *Добби тыкает на карту*, там вы сможете забрать свой приз!

Псс...Если Полумны там нет, можешь отправить сову этому волшебнику и получить свой приз - @lemonnerlime`

// #region Панелька
bot.command('events', async (ctx) => {
    const commonButtons = [
        [Markup.button.callback('🏆 Рейтинг Факультетов', 'show_points')],
        [Markup.button.callback('📅 Показать расписание активностей', 'show_schedule')],
        [Markup.button.callback('📊 Показать статистику игрока', 'show_stats')]]

    const moderatorButtons = isModerator(ctx.from.id) ? [
        [Markup.button.callback('➕ Добавить очки факультету', 'add_points')],
        [Markup.button.callback('👥 Показать всех участников', 'show_users')],
        [Markup.button.callback('🔒 Закрыть набор на мероприятие', 'close_event')],
        [Markup.button.callback('🔅 Обновить количество свободных мест', 'update_spots')]] : []

    const cancelButton = [Markup.button.callback('❌ Отменить', 'cancel_action')]

    const keyboard = Markup.inlineKeyboard([...commonButtons, ...moderatorButtons, cancelButton])

    await ctx.reply('📋 Выберите действие:', keyboard)
})

bot.action('show_events', async (ctx) => {
    const commonButtons = [
        [Markup.button.callback('🏆 Рейтинг Факультетов', 'show_points')],
        [Markup.button.callback('📅 Показать расписание активностей', 'show_schedule')],
        [Markup.button.callback('📊 Показать статистику игрока', 'show_stats')]]

    const moderatorButtons = isModerator(ctx.from.id) ? [
        [Markup.button.callback('➕ Добавить очки факультету', 'add_points')],
        [Markup.button.callback('👥 Показать всех участников', 'show_users')],
        [Markup.button.callback('🔒 Закрыть набор на мероприятие', 'close_event')],
        [Markup.button.callback('🔅 Обновить количество свободных мест', 'update_spots')]] : []

    const cancelButton = [Markup.button.callback('❌ Отменить', 'cancel_action')]

    const keyboard = Markup.inlineKeyboard([...commonButtons, ...moderatorButtons, cancelButton])

    await ctx.editMessageText('📋 Выберите действие:', keyboard)
})

const facultyNamesRu = {
    gryffindor: 'Гриффиндор',
    hufflepuff: 'Пуффендуй',
    ravenclaw: 'Когтевран',
    slytherin: 'Слизерин'
}

bot.action('add_points', async (ctx) => {
    if (!isModerator(ctx.from.id)) {
        await ctx.answerCbQuery('У вас нет прав для выполнения этого действия.')
        return
    }

    moderatorState[ctx.from.id] = { action: ctx.match[0] }

    const facultyButtons = Object.keys(progressData.faculties).map((faculty) =>
        [Markup.button.callback(facultyNamesRu[faculty], `select_faculty_${faculty}`)]
    )

    const cancelButton = [Markup.button.callback('❌ Отменить', 'cancel_action')]
    const keyboard = Markup.inlineKeyboard([...facultyButtons, cancelButton])

    await ctx.editMessageText(
        `🔹 Выберите факультет для добавления баллов:`,
        keyboard
    )
})

bot.action('cancel_action', async (ctx) => {
    if (moderatorState[ctx.from.id]) {
        delete moderatorState[ctx.from.id]
    }

    await ctx.editMessageText('❌ Действие отменено.')
})

bot.action('show_points', async (ctx) => {
    const userId = ctx.from.id

    if (!introState[userId]) {
        introState[userId] = true
        await ctx.answerCbQuery()
        await ctx.reply(
            `🏆 <b>Кубок Хогвартса</b>:\n\n` +
            `Добби расскажет что это такое. Кубок Хогвартса — награда, вручаемая факультету, набравшему наибольшее количество очков за все мероприятия. Вы можете участвовать в активностях и приносить баллы своему факультету. 
            
Кстати, в 17:30 будет Ежедневный Пророк будет делать фотографии факультетов и, если вы в это время свободны, то можете подойти в главный зал.`, { parse_mode: 'HTML' }
        )
    }

    const scores = Object.entries(progressData.faculties).map(([faculty, points]) => `${facultyNamesRu[faculty]}: ${points}`).join('\n')

    await ctx.reply(`📊 <b>Текущий рейтинг факультетов:</b>\n\n${scores}`, { parse_mode: 'HTML' })
})

bot.action('show_schedule', async (ctx) => {
    const updatedSchedule = sortEventsByTime(updateEventStatus(schedule))

    if (updatedSchedule.length == 0) {
        await ctx.reply("Кажется, сейчас нет активных мероприятий. Добби предлагает немного передохнуть")
        return
    }

    const eventList = updatedSchedule.map(event => {
        const statusIcon = getStatusIcon(event.status)
        return `
⚜️ <b>${event.name}</b>
⏰ <b>Время:</b> ${event.startTime}–${event.endTime}
🗺 <b>Зал:</b> ${event.hall}
👤 <b>Ведущий:</b> ${event.host}
🔗 <a href="${event.link}" target="_blank">Подробнее</a>
${statusIcon} <b>Статус:</b> ${event.status}
💺 <b>Занятые места:</b> ${event.occupiedSpots}/${event.maxPlayers}
`}).join('')

    await ctx.reply(`${eventList}
🏰 Вот карта, чтобы вам было легче ориентироваться!`, { parse_mode: 'HTML', disable_web_page_preview: true })
    await ctx.replyWithPhoto({ source: './pictures/hny.png' })
})

function updateEventStatus(schedule) {
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

    return schedule.map(event => {
        if (event.endTime <= currentTime) {
            return null
        }
        if (currentTime < event.startTime) {
            event.status = "Ожидание начала мероприятия"
        } else if (currentTime >= event.startTime && event.status !== "В игре") {
            event.status = event.occupiedSpots < event.maxPlayers 
                ? "Ожидание участников" 
                : "Ожидание начала мероприятия"
        }
        return event
    }).filter(event => event)
}

function sortEventsByTime(schedule) {
    return schedule.sort((a, b) => a.startTime.localeCompare(b.startTime))
}

function getStatusIcon(status) {
    switch (status) {
        case "В игре": return "🟢"
        case "Ожидание участников": return "🟡"
        case "Ожидание начала мероприятия": return "🔴"
        default: return "⚪"
    }
}

bot.action('close_event', async (ctx) => {
    const eventButtons = Object.keys(schedule)
        .filter(event => (schedule[event].status == "Ожидание участников" || schedule[event].status == "Ожидание начала мероприятия"))
        .map(event => 
            [Markup.button.callback(
                `${schedule[event].name} (${schedule[event].occupiedSpots}/${schedule[event].maxPlayers}) - ${schedule[event].startTime}`, 
                `select_event_close_${schedule[event].id}`
            )]
        )

    const keyboard = Markup.inlineKeyboard([...eventButtons, [Markup.button.callback('❌ Отмена', 'cancel_action')]], { columns: 1 })
    await ctx.editMessageText('Выберите мероприятие для закрытия набора:', keyboard)
})

bot.action(/select_event_close_(.+)/, async (ctx) => {
    const eventName = ctx.match[1]
    moderatorState[ctx.from.id] = { eventName, action: 'close_event' }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Подтвердить', `confirm_close_${eventName}`)],
        [Markup.button.callback('❌ Отмена', 'cancel_action')]
    ])
    await ctx.editMessageText(`❓ Вы уверены, что хотите закрыть набор для этого мероприятия"?`, keyboard)
})

bot.action(/confirm_close_(.+)/, async (ctx) => {
    const eventName = ctx.match[1]

    const event = schedule.find(event => event.id == eventName)
    if (event) {
        event.status = "В игре"
        saveSchedule(schedule)
        await ctx.editMessageText(`Набор для "${event.name}" закрыт, мероприятие начато!`)
    }

    delete moderatorState[ctx.from.id]
})

bot.action('update_spots', async (ctx) => {
    const eventButtons = Object.keys(schedule)
        .filter(event => (schedule[event].status == "Ожидание участников" || schedule[event].status == "Ожидание начала мероприятия"))
        .map(event => 
            [Markup.button.callback(
                `${schedule[event].name} (${schedule[event].occupiedSpots}/${schedule[event].maxPlayers}) - ${schedule[event].startTime}`, 
                `select_event_add_${schedule[event].id}`
            )]
        )

    const keyboard = Markup.inlineKeyboard([...eventButtons, [Markup.button.callback('❌ Отмена', 'cancel_action')]], { columns: 1 })
    await ctx.editMessageText('Выберите мероприятие для добавления участников:', keyboard)
})

bot.action(/select_event_add_(.+)/, async (ctx) => {
    const eventName = ctx.match[1]
    moderatorState[ctx.from.id] = { eventName, action: 'update_spots' }

    const event = schedule.find(event => event.id == eventName)
    if (event) {
        const keyboard = Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_action')]])
        const message = await ctx.editMessageText(`🔢 Введите количество прибывших участников для "${event.name}":`, { reply_markup: keyboard.reply_markup })
        moderatorState[ctx.from.id].messageId = message.message_id
        return
    }
})

bot.action('show_users', async (ctx) => {
    if (!isModerator(ctx.from.id)) {
        await ctx.reply("У вас нет прав для выполнения этой команды.")
        return
    }

    if (Object.keys(progressData.users).length == 0) {
        await ctx.reply("Список пользователей пуст.")
        return
    }

    const userList = Object.entries(progressData.users)
        .map(([id, data]) => {
            const statusIcons = `${isModerator(Number(id)) ? '⭐' : ''}${progressData.bannedUsers.includes(Number(id)) ? '🚫' : ''}`.trim()

            return `${statusIcons} ${data.username || 'Неизвестный'} (ID: ${id}): ${
                data.completed
                    ? `✅ Завершил за ${data.completionTime}, ошибок: ${data.errors}` 
                    : `⏳ Не завершил, ошибок: ${data.errors}`
            }`
        })
        .join('\n')

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Показать победителей', 'show_winners')],
        [Markup.button.callback('Вернуться', 'show_events')]
    ])

    await ctx.editMessageText(`Список участников:\n${userList}`, keyboard)
})

bot.action('show_stats', async (ctx) => {
    const userId = ctx.from.id
    const user = progressData.users[userId]

    if (!user) {
        await ctx.reply('У вас нет активного профиля. Присоединяйтесь к квесту, чтобы получить статистику!')
        return
    }

    const place = progressData.completedUsers.includes(userId)
        ? progressData.completedUsers.indexOf(userId) + 1
        : null

    const statsMessage = `
📊 <b>Ваша статистика:</b>

- ${user.initials} (${user.username})

- ${place ? `Место в турнире: ${getMedal(place)} ${place}` : `Вы не завершили квест. Текущий этап: #${user.currentElement + 1}`}
- ⏱ Проведенное время: ${place ? user.completionTime : formatTime(Date.now() - user.startTime).toLocaleString()}
- ❌ Ошибок: ${user.errors}
- 🏠 Ваш факультет: ${facultyNamesRu[user.faculty]}
    `

    await ctx.reply(statsMessage.trim(), { parse_mode: 'HTML' })
})

bot.action('show_winners', async (ctx) => {
    if (!isModerator(ctx.from.id)) {
        await ctx.reply("У вас нет прав для выполнения этой команды.")
        return
    }

    const winnersList = progressData.completedUsers
        .map((id, index) => {
            const data = progressData.users[id]
            if (!data) return null
            return `🏆 ${index + 1}-е место: ${data.initials || 'Неизвестный'} (ID: ${data.username}) — Завершил за ${data.completionTime}, ошибок: ${data.errors}`
        })
        .filter(Boolean)
        .join('\n');

    const winnersMessage = winnersList.length > 0 
        ? `Список победителей:\n${winnersList}`
        : "Список победителей пуст."

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Показать всех участников', 'show_users')],
    ]);

    await ctx.editMessageText(winnersMessage, keyboard )
})

function getMedal(place) {
    if (place == 1) return '🥇'
    if (place == 2) return '🥈'
    if (place == 3) return '🥉'
    return ''
}

// #endregion

const sendElement = async (ctx, userId) => {
    const element = elements[progressData.users[userId]?.currentElement || 0]

    if (!element) {
        await ctx.replyWithPhoto({ source: './pictures/hny.png' }, { 
            caption: winningMessage(ctx.from), 
            parse_mode: 'HTML' 
        })
        return
    }

    element.intro ? await ctx.reply(element.intro(ctx.from, progressData.users[ctx.from.id].gender), { parse_mode: 'HTML' }) : ''
    element.type == "question" ? element.question ? await ctx.reply(element.question, { parse_mode: 'HTML' }) : '' : element.type == "task" ? element.task ? await ctx.reply(element.task, { parse_mode: 'HTML' }) : '' : ''
    element.image ? await ctx.replyWithPhoto({ source: element.image }) : ''
}

// #region Старт
bot.start(async (ctx) => {
    const userId = ctx.from.id

    if (progressData.bannedUsers.includes(userId)) {
        await ctx.reply("Вы забанены и не можете взаимодействовать с ботом.")
        return
    }

    if (progressData.users[userId]?.completed) {
        await ctx.replyWithPhoto({ source: './pictures/hny.png' }, { 
            caption: winningMessage(ctx.from), 
            parse_mode: 'HTML' 
        })
        return
    }

    if (progressData.users[userId]) {
        await sendElement(ctx, userId)
        return
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('▶️ Начать квест', 'start_quest')],
        [Markup.button.callback('🏆 Рейтинг Факультетов', 'show_points')],
        [Markup.button.callback('📅 Расписание активностей', 'show_schedule')],
    ])

    await ctx.reply(`Добрый вечер, ${ctx.from.first_name}! Меня зовут Добби! Добби - домашний эльф. И сегодня Добби будет помогать Вам пройти испытание и повеселиться от души на предновогодней вечеринке <b><i>“Harry New Year”</i></b>.

Добби поможет вам выполнить задания, которые подготовили преподаватели и студенты Хогвартса. И если возникнут трудности с заданиями, ${ctx.from.first_name} всегда может попросить помощи у Добби. Кроме того Добби может подсказать расписание мероприятий на вечеринке и количество очков, которые набрали факультеты в соревновании за Кубок Хогвартса.

Хотели бы вы принять участие в легендарном <b>“Турнире трёх волшебников”?</b>`, 
        { parse_mode: 'HTML', reply_markup: keyboard.reply_markup }
    )
})

bot.action('start_quest', async (ctx) => {
    const userId = ctx.from.id

    if (progressData.users[userId]) {
        await ctx.editMessageText('Удачи! 💪 Победит умнейший!')
        await sendElement(ctx, userId)
        return
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🧙‍♂️ Сэр', 'select_gender_sir')],
        [Markup.button.callback('🧙‍♀️ Мисс', 'select_gender_miss')],
    ])

    await ctx.editMessageText('Подскажите, как Добби может к вам обращаться?', {
        reply_markup: keyboard.reply_markup,
    })
})

bot.action('select_gender_sir', async (ctx) => {
    const userId = ctx.from.id

    introState[userId] = { gender: 'сэр' }

    await promptFacultySelection(ctx)
})

bot.action('select_gender_miss', async (ctx) => {
    const userId = ctx.from.id

    introState[userId] = { gender: 'мисс' }

    await promptFacultySelection(ctx)
})

async function promptFacultySelection(ctx) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🦁 Гриффиндор', 'select_faculty_gryffindor')],
        [Markup.button.callback('🦡 Пуффендуй', 'select_faculty_hufflepuff')],
        [Markup.button.callback('🦅 Когтевран', 'select_faculty_ravenclaw')],
        [Markup.button.callback('🐍 Слизерин', 'select_faculty_slytherin')],
    ])

    await ctx.editMessageText('Теперь выберите ваш факультет:', {
        reply_markup: keyboard.reply_markup,
    })
}

bot.action(/select_faculty_(.+)/, async (ctx) => {
    const userId = ctx.from.id
    const faculty = ctx.match[1]
    if (moderatorState[userId]) {
        moderatorState[userId].faculty = faculty

        const cancelButton = [Markup.button.callback('❌ Отменить', 'cancel_action')]
        const keyboard = Markup.inlineKeyboard(cancelButton)

        const message = await ctx.editMessageText(
            `🔢 Введите количество баллов для факультета "${facultyNamesRu[faculty]}":`,
            { reply_markup: keyboard.reply_markup }
        )

        moderatorState[userId].messageId = message.message_id
        return
    } 

    initUser(
        userId,
        ctx.from.username,
        ctx.from.last_name ? `${ctx.from.first_name} ${ctx.from.last_name}` : ctx.from.first_name
    )

    progressData.users[userId].gender = introState[userId]?.gender
    progressData.users[userId].faculty = faculty
    
    // if (introState[userId].gender)
    //     delete introState[userId].gender

    saveProgress(progressData)

    console.log(
        `\x1b[32m[START]\x1b[0m Участник "${ctx.from.last_name ? ctx.from.first_name + ' ' + ctx.from.last_name : ctx.from.first_name}" выбрал факультет \x1b[34m${facultyNamesRu[faculty]}\x1b[0m и присоединился к квесту.`
    )

    await ctx.editMessageText(
        `Удачи! 💪 Победит умнейший!`
    )

    await sendElement(ctx, userId)
})
// #endregion

// #region Хелп
bot.help(async (ctx) => {
    const userId = ctx.from.id

    let response = `💡 Если есть вопросы, можете подойти к организаторам, которые находятся на первом этаже у кассы или напиши этому волшебнику - @lemonnerlime`

    await ctx.reply(response)
})
// #endregion

bot.hears('u nigger', async (ctx) => await ctx.reply('u too❤️'))
bot.hears('души меня прекрасная женщина', async (ctx) => {await ctx.replyWithVideo({ source: './rela.mp4' })})

// #region Рестарт
bot.command('restart', async (ctx) => {
    const userId = ctx.from.id

    if (!progressData.users[userId]) {
        await ctx.reply('У вас ещё нет активного профиля. Напишите /start, чтобы начать квест.')
        return
    }

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Подтвердить перезапуск', 'confirm_restart')],
        [Markup.button.callback('❌ Отмена', 'cancel_restart')],
    ])

    await ctx.reply(
        'Вы уверены, что хотите начать всё заново? ❗️\nВаш текущий прогресс будет удалён без возможности восстановления.',
        keyboard
    )
})

bot.action('confirm_restart', async (ctx) => {
    const userId = ctx.from.id

    if (!progressData.users[userId]) {
        await ctx.answerCbQuery('У вас уже нет активного профиля. Напишите /start, чтобы начать квест.', { show_alert: true })
        return
    }

    delete progressData.users[userId]
    progressData.completedUsers = progressData.completedUsers.filter(id => id !== userId)
    saveProgress(progressData)

    console.log(`\x1b[34m[RESTART]\x1b[0m Участник "${ctx.from.last_name ? ctx.from.first_name + ' ' + ctx.from.last_name : ctx.from.first_name}" покинул квест.`)
     
    await ctx.editMessageText(
        'Ваш профиль успешно сброшен'
    )
})

bot.action('cancel_restart', async (ctx) => {
    await ctx.editMessageText('Перезапуск отменён. Ваш прогресс сохранён.')
})
// #endregion

// #region БАН
bot.command('ban', async (ctx) => {
    if (!isModerator(ctx.from.id)) {
        await ctx.reply("❌ У вас нет прав для выполнения этой команды.")
        return
    }

    const args = ctx.message.text.split(' ')
    if (args.length !== 2) {
        await ctx.reply("Неверный формат. Используйте: /ban [ID пользователя]")
        return
    }

    const targetId = args[1]

    if (isNaN(parseInt(targetId, 10))) {
        await ctx.reply("Укажите корректный ID пользователя.")
        return
    }

    if (!progressData.users[targetId]) {
        await ctx.reply("Пользователь с таким ID не найден.")
        return
    }

    await ctx.reply(`Пользователь с ID ${targetId} (${progressData.users[targetId].username}) был забанен и удалён из базы.`)
    console.log(`\x1b[31m[BAN]\x1b[0m Администратор ${ctx.from.last_name ? ctx.from.first_name + ' ' + ctx.from.last_name : ctx.from.first_name} забанил пользователя с ID ${targetId} (${progressData.users[targetId].username})`)

    delete progressData.users[targetId]

    const completedIndex = progressData.completedUsers.indexOf(parseInt(targetId, 10))
    if (completedIndex !== -1) {
        progressData.completedUsers.splice(completedIndex, 1)
    }

    if (!progressData.bannedUsers.includes(parseInt(targetId, 10))) {
        progressData.bannedUsers.push(parseInt(targetId, 10))
    }

    saveProgress(progressData)

    try {
        await bot.telegram.sendMessage(
            targetId,
            `Вы были забанены модератором и больше не можете взаимодействовать с ботом. Если вы считаете, что это ошибка, обратитесь к администратору ${ctx.from.last_name ? ctx.from.first_name + ' ' + ctx.from.last_name : ctx.from.first_name}.`
        )
    } catch (error) {
        console.error(`Не удалось отправить сообщение пользователю с ID ${targetId}: ${error.message}`)
    }
})
// #endregion

// #region МОД
bot.command('mod', async (ctx) => {
    if (!isModerator(ctx.from.id)) {
        await ctx.reply("❌ У вас нет прав для выполнения этой команды.")
        return
    }

    const args = ctx.message.text.split(' ')
    if (args.length !== 2) {
        await ctx.reply("Неверный формат. Используйте: /mod [ID пользователя]")
        return
    }

    const targetId = args[1]

    if (progressData.moderators.includes(parseInt(targetId, 10))) {
        await ctx.reply("Этот пользователь уже является модератором.")
        return
    }

    progressData.moderators.push(parseInt(targetId, 10))

    let username
    try {
        const chat = await bot.telegram.getChat(targetId)
        username = chat.username || `${chat.first_name || ''} ${chat.last_name || ''}`.trim() || "неизвестный"
    } catch (error) {
        console.error(`Не удалось получить информацию о пользователе с ID ${targetId}: ${error.message}`)
    }

    saveProgress(progressData)

    await ctx.reply(`Пользователь с ID ${targetId} (${username}) был повышен до модератора.`)
    console.log(`\x1b[32m[PROMOTE]\x1b[0m Администратор ${ctx.from.last_name ? ctx.from.first_name + ' ' + ctx.from.last_name : ctx.from.first_name} повысил до должности модератора пользователя с ID ${targetId} (${username})`)

    try {
        await bot.telegram.sendMessage(
            targetId,
            `Вы были повышены до должности <b>Модератора</b> и можете взаимодействовать с дополнительными опциями бота.

Если вы считаете, что это ошибка, обратитесь к администратору @lemonnerlime.`,
            { parse_mode: 'HTML' }
        )
    } catch (error) {
        console.error(`Не удалось отправить сообщение пользователю с ID ${targetId}: ${error.message}`)
    }
})
// #endregion

// #region Конец квеста
bot.command('end', async (ctx) => {
    if (!isModerator(ctx.from.id)) {
        await ctx.reply('❌ У вас нет прав для завершения квеста.')
        return
    }

    if (progressData.questEnded) {
        await ctx.reply('Квест уже завершён.')
        return
    }

    const confirmKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Завершить квест', 'confirm_end')],
        [Markup.button.callback('❌ Отмена', 'cancel_end')]
    ])

    await ctx.reply(
        '⚠️ Вы уверены, что хотите завершить квест? Это действие необратимо.',
        confirmKeyboard
    )
})

bot.action('confirm_end', async (ctx) => {
    if (!isModerator(ctx.from.id)) {
        await ctx.answerCbQuery('У вас нет прав для выполнения этого действия.')
        return
    }

    progressData.questEnded = true

    const facultyScores = Object.entries(progressData.faculties)
        .map(([faculty, score]) => `${facultyNamesRu[faculty]}: ${score} баллов`)
        .join('\n')

    const winners = progressData.completedUsers
        .map((userId, index) => {
            const user = progressData.users[userId]
            if (!user) return null

            let place
            if (index == 0)
                place = '🥇 Золотая медаль'
            else if (index == 1)
                place = '🥈 Серебряная медаль'
            else if (index == 2)
                place = '🥉 Бронзовая медаль'
            else
                place = `${index + 1} место`

            return `${place}: ${user.initials || user.username || 'Неизвестный'} — Время прохождения: ${user.completionTime}`
        })
        .filter(Boolean)
        .join('\n')

    const message = `🏆 Квест завершён! Спасибо за участие.🎉\n\nПобедители:\n${winners}\n\n🏅 Кубок Хогвартса:\n${facultyScores}`.trim()
    console.log(`\x1b[34m[END]\x1b[0m Квест завершён`)

    for (const userId of Object.keys(progressData.users)) {
        try {
            await bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' })
        } catch (error) {
            console.error(`Не удалось отправить сообщение пользователю ${userId}:`, error.message)
        }
    }

    saveProgress(progressData)
    await ctx.editMessageText('✅ Квест успешно завершён.')
})

bot.action('cancel_end', async (ctx) => {
    await ctx.editMessageText('Завершение квеста отменено.')
})

bot.use(async (ctx, next) => {
    const userId = ctx.from.id

    if (progressData.questEnded) {
        if (
            ctx.message &&
            ctx.message.text &&
            !['/help', '/events'].includes(ctx.message.text.split(' ')[0])
        ) {
            const user = progressData.users[userId]
            if (user) {
                const placeIndex = progressData.completedUsers.indexOf(userId)
                let placeMessage

                if (user.completed) {
                    if (placeIndex == 0) {
                        placeMessage = `Вы заняли 1-е место и получили 🥇 Золотую медаль`
                    } else if (placeIndex == 1) {
                        placeMessage = `Вы заняли 2-е место и получили 🥈 Серебряную медаль`
                    } else if (placeIndex == 2) {
                        placeMessage = `Вы заняли 3-е место и получили 🥉 Бронзовую медаль`
                    } else {
                        placeMessage = `Вы заняли ${placeIndex + 1}-е место`
                    }
                } else {
                    placeMessage = `Вы остановились на вопросе #${user.currentElement + 1}.`
                }

                const message = `Квест завершён. ${placeMessage}`
                await ctx.reply(message)
            } else {
                await ctx.reply('Квест завершён. Вы не участвовали в квесте')
            }
            return
        }
    }

    await next()
})
// #endregion

// #region ботон текст
bot.on(message('text'), async (ctx) => {
    const userId = ctx.from.id

    if (moderatorState[userId] && moderatorState[userId].action == 'update_spots') {
        const newParticipants = parseInt(ctx.message.text, 10)

        if (isNaN(newParticipants) || newParticipants < 0) {
            await ctx.reply('❌ Введите корректное число участников.')
            return
        }

        const { eventName, messageId } = moderatorState[userId]
        const event = schedule.find(event => event.id == eventName)

        if (!event) {
            await ctx.reply('Мероприятие не найдено.')
            delete moderatorState[userId]
            return
        }

        if (event.occupiedSpots + newParticipants > event.maxPlayers) {
            await ctx.reply(`Превышено максимальное количество участников! Доступно только ${event.maxPlayers - event.occupiedSpots} мест.`)
            return
        }

        if (messageId) {
            try {
                await ctx.telegram.editMessageReplyMarkup(ctx.chat.id, messageId, null, null)
            } catch (error) {
                console.error('Ошибка при удалении кнопок:', error)
            }
        }

        event.occupiedSpots += newParticipants
        saveSchedule(schedule)

        await ctx.reply(`✅ Теперь занято ${event.occupiedSpots}/${event.maxPlayers} мест для "${event.name}".`)
        delete moderatorState[userId]
        return
    }

    if (moderatorState[userId] && moderatorState[userId].faculty) {
        if (isNaN(parseInt(ctx.message.text, 10)) || ctx.message.text.length > 4) {
            await ctx.reply('❌ Введите корректное число баллов.')
            return
        }

        const { action, faculty, messageId } = moderatorState[userId]

        if (action == 'add_points') {
            progressData.faculties[faculty] += parseInt(ctx.message.text, 10)
        }
        saveProgress(progressData)

        if (messageId) {
            try {
                await ctx.telegram.editMessageReplyMarkup(ctx.chat.id, messageId, null, null)
            } catch (error) {
                console.error('Ошибка при удалении кнопок:', error)
            }
        }

        console.log(`\x1b[36m[POINTS]\x1b[0m Администратор ${ctx.from.last_name ? ctx.from.first_name + ' ' + ctx.from.last_name : ctx.from.first_name} \x1b[32mдобавил(а)\x1b[0m \x1b[33m${parseInt(ctx.message.text, 10)}\x1b[0m очков факультету \x1b[34m${facultyNamesRu[faculty]}\x1b[0m.`)
        await ctx.reply(`✅ Очки успешно обновлены!\n${facultyNamesRu[faculty]}: ${progressData.faculties[faculty]} очков.`)

        delete moderatorState[userId]
        return
    }

    if (isModerator(ctx.from.id)) {
        await ctx.reply("Вы модератор и не можете участвовать в квесте.")
        return
    }

    if (progressData.bannedUsers.includes(userId)) {
        await ctx.reply("Вы забанены и не можете взаимодействовать с ботом.")
        return
    }

    if (!progressData.users[userId]) {
        await ctx.reply('У вас ещё нет активного профиля. Напишите /start, чтобы начать квест.')
        return
    }
    
    let usersElement = progressData.users[userId]

    initUser(userId, ctx.from.username, ctx.from.last_name ? ctx.from.first_name + ' ' + ctx.from.last_name : ctx.from.first_name)

    if (usersElement?.completed) {
        await ctx.replyWithPhoto({ source: './pictures/hny.png' }, { 
            caption: winningMessage(ctx.from), 
            parse_mode: 'HTML' 
        })
        return
    }

    const userAnswer = ctx.message.text.trim().toLowerCase()

    if (usersElement.lastAttempt && Date.now() - usersElement.lastAttempt < 120000) {
        const remainingTime = Math.ceil((120000 - (Date.now() - usersElement.lastAttempt)) / 1000)
        await ctx.reply(`Пожалуйста, подождите ${remainingTime} секунд перед следующей попыткой.`)
        return
    }

    usersElement.lastAttempt = Date.now()

    if (elements[usersElement.currentElement]?.type == "question") {
        if (userAnswer == elements[usersElement.currentElement].answer.toLowerCase()) {
            if (elements[usersElement.currentElement].postanswer) {
                await ctx.reply((elements[usersElement.currentElement].postanswer(ctx.from, usersElement.gender)), { parse_mode: 'HTML' })
            }

            usersElement.currentElement += 1
            usersElement.lastAttempt = null

            if (usersElement.currentElement >= elements.length) {
                usersElement.completionTime = formatTime(Date.now() - usersElement.startTime)
                usersElement.completed = true
                progressData.completedUsers.push(userId)
                saveProgress(progressData)
                await ctx.replyWithPhoto({ source: './pictures/hny.png' }, { 
                    caption: winningMessage(ctx.from), 
                    parse_mode: 'HTML' 
                })
            } else {
                saveProgress(progressData)
                await sendElement(ctx, userId)
            }
        } else if (usersElement?.currentElement == 4 && (userAnswer.toLowerCase() == 'боггарт' || userAnswer.toLowerCase() == 'азкабан' || userAnswer.toLowerCase() == 'люмос')) {
            usersElement.lastAttempt = null
            saveProgress(progressData)
            await ctx.reply(`Молодец, что ${usersElement.gender} это ${usersElement.gender == 'сэр' ? 'понял' : 'поняла'}! Но вам надо разгадать шифр из молний!`)
        } else if (usersElement?.currentElement == 5) {
            usersElement.currentElement += 1
            usersElement.lastAttempt = null

            saveProgress(progressData)
            await ctx.reply((`Что? Но ${usersElement.gender}, при чем здесь ${userAnswer}? Ну и что, что сэр Гарри Поттер ходил куда-то и окунал там своё яйцо, вы то тут причём! Наслушаются всяких Седриков...
Ой Добби не хотел грубить! Добби только хотел сказать, чтобы узнать секрет из яйца, ${usersElement.gender} <b>${ctx.from.first_name}</b> ${usersElement.gender == 'сэр' ? 'должен' : 'должна'} найти таинственный символ. Найдите его и отправьте Добби, чтобы Добби помог.`), { parse_mode: 'HTML' })
            await sendElement(ctx, userId)
        } else if (usersElement?.currentElement == 8) {
            const cleanedAnswer = userAnswer.replace(/[\s,\.]+/g, '').toLowerCase()

            if (cleanedAnswer == 'кн4стр243ст12сл34') {
                usersElement.lastAttempt = null
                await ctx.reply(`Это не ответ, ${usersElement.gender}! Попробуйте найти книгу, она вам поможет`)
            }
        } else {
            usersElement.errors += 1
            saveProgress(progressData)
            await ctx.reply("Неправильно. Попробуйте еще раз через 2 минуты.")
        }
    } else {
        usersElement.lastAttempt = null
        await ctx.reply("Сейчас вам нужно прислать фотографию для задания.")
    }
})
// #endregion

// #region ботон фото
bot.on(message('photo'), async (ctx) => {
    const userId = ctx.from.id

    if (isModerator(ctx.from.id)) {
        await ctx.reply("Вы модератор и не можете участвовать в квесте.")
        return
    }

    if (progressData.bannedUsers.includes(userId)) {
        await ctx.reply("Вы забанены и не можете взаимодействовать с ботом.")
        return
    }

    if (!progressData.users[userId]) {
        await ctx.reply('У вас ещё нет активного профиля. Напишите /start, чтобы начать квест.')
        return
    }

    let usersElement = progressData.users[userId]
    initUser(userId, ctx.from.username, ctx.from.last_name ? ctx.from.first_name + ' ' + ctx.from.last_name : ctx.from.first_name)

    if (usersElement.completed) {
        await ctx.replyWithPhoto({ source: './pictures/hny.png' }, { 
            caption: winningMessage(ctx.from), 
            parse_mode: 'HTML' 
        })
        return
    }

    if (elements[usersElement.currentElement]?.type == "task") {
        if (!ctx.message.photo || ctx.message.photo.length == 0) {
            await ctx.reply("Фото не обнаружено. Попробуйте еще раз.")
            return
        }

        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id

        if (usersElement.processing) {
            return
        }

        usersElement.processing = true

        try {
            if (elements.postanswer) {
                await ctx.reply((elements.postanswer(ctx.from, usersElement.gender)), { parse_mode: 'HTML' })
            }

            const fileLink = await bot.telegram.getFileLink(photoId)
            const response = await axios({
                url: fileLink.href,
                method: 'GET',
                responseType: 'stream',
            })

            const writer = fs.createWriteStream(`./uploads/${ctx.from.username}_${Date.now()}.jpg`)
            response.data.pipe(writer)

            writer.on('finish', async () => {
                usersElement.processing = false
                usersElement.currentElement += 1
                saveProgress(progressData)

                if (usersElement.currentElement >= elements.length) {
                    usersElement.completionTime = formatTime(Date.now() - usersElement.startTime)
                    usersElement.completed = true
                    progressData.completedUsers.push(userId)
                    saveProgress(progressData)

                    await ctx.replyWithPhoto({ source: './pictures/hny.png' }, { 
                        caption: winningMessage(ctx.from), 
                        parse_mode: 'HTML' 
                    })
                } else {
                    await sendElement(ctx, userId)
                }
            })

            writer.on('error', async () => {
                usersElement.processing = false
                await ctx.reply("Произошла ошибка при сохранении фото. Попробуйте еще раз.")
            })
        } catch (error) {
            console.error(error)
            usersElement.processing = false
            await ctx.reply("Не удалось загрузить фото. Попробуйте еще раз.")
        }
    } else {
        await ctx.reply("Сейчас нужно ответить на вопрос, а не присылать фото.")
    }
})
// #endregion

bot.launch()