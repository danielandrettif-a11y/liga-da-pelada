import {
  align,
  createWidget,
  deleteWidget,
  event,
  prop,
  text_style,
  widget,
} from '@zos/ui'
import {
  SystemSounds,
  Vibrator,
  VIBRATOR_SCENE_TIMER,
} from '@zos/sensor'

const WIDTH = 480
const TEST_DURATION_SECONDS = 30

const COLORS = {
  background: 0x00140c,
  panel: 0x062519,
  border: 0x1f543a,
  lime: 0xbaff00,
  white: 0xffffff,
  muted: 0x8dac9c,
  blue: 0x2f80ff,
  red: 0xff4d57,
  warning: 0xffc43d,
}

const PLAYERS = {
  blue: ['Daniel', 'André', 'George', 'Lucas', 'Pedro'],
  red: ['Jhonata', 'Natan', 'Wallison', 'Anna', 'Duda'],
}

function pad(value) {
  return value < 10 ? `0${value}` : `${value}`
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds)
  return `${pad(Math.floor(safeSeconds / 60))}:${pad(safeSeconds % 60)}`
}

DataWidget({
  state: {
    blueScore: 0,
    redScore: 0,
    deadline: 0,
    remainingSeconds: TEST_DURATION_SECONDS,
    timerId: null,
    timerText: null,
    widgets: [],
    screen: 'scoreboard',
    pendingTeam: null,
    pendingScorer: null,
    alerting: false,
    vibrator: null,
    sounds: null,
    tapLockedUntil: 0,
  },

  onInit() {
    this.state.vibrator = new Vibrator()
    this.state.sounds = new SystemSounds()
    this.state.deadline = Date.now() + TEST_DURATION_SECONDS * 1000
  },

  build() {
    this.renderScoreboard()
    this.startTimer()
  },

  onResume() {
    this.refreshTimer()
    this.startTimer()
  },

  onPause() {
    this.stopTimer()
  },

  onDestroy() {
    this.stopTimer()
    this.stopEndAlert()
    this.clearScreen()
  },

  addWidget(type, options) {
    const item = createWidget(type, options)
    this.state.widgets.push(item)
    return item
  },

  addText(options) {
    return this.addWidget(widget.TEXT, {
      color: COLORS.white,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.ELLIPSIS,
      ...options,
    })
  },

  addPanel(options) {
    return this.addWidget(widget.FILL_RECT, options)
  },

  addClickArea(options, callback) {
    const area = this.addPanel({
      color: COLORS.panel,
      radius: 18,
      ...options,
    })
    this.bindClick(area, callback)
    return area
  },

  bindClick(item, callback) {
    item.addEventListener(event.CLICK_UP, () => {
      const now = Date.now()
      if (now < this.state.tapLockedUntil) return
      this.state.tapLockedUntil = now + 250
      callback()
    })
    return item
  },

  clearScreen() {
    this.state.widgets.forEach((item) => deleteWidget(item))
    this.state.widgets = []
    this.state.timerText = null
  },

  startTimer() {
    if (this.state.timerId || this.state.alerting) return

    this.state.timerId = setInterval(() => {
      this.refreshTimer()
    }, 1000)
  },

  stopTimer() {
    if (!this.state.timerId) return
    clearInterval(this.state.timerId)
    this.state.timerId = null
  },

  refreshTimer() {
    if (this.state.alerting) return

    const nextRemaining = Math.max(
      0,
      Math.ceil((this.state.deadline - Date.now()) / 1000),
    )
    this.state.remainingSeconds = nextRemaining

    if (this.state.timerText) {
      this.state.timerText.setProperty(prop.TEXT, formatTime(nextRemaining))
    }

    if (nextRemaining === 0) {
      this.showEndAlert()
    }
  },

  renderScoreboard() {
    this.state.screen = 'scoreboard'
    this.clearScreen()

    this.addPanel({ x: 0, y: 0, w: WIDTH, h: 480, color: COLORS.background })
    this.addText({
      x: 120,
      y: 18,
      w: 240,
      h: 38,
      text: 'PELADA DE BAIXA QUALIDADE',
      text_size: 20,
      color: COLORS.lime,
    })
    this.state.timerText = this.addText({
      x: 140,
      y: 54,
      w: 200,
      h: 76,
      text: formatTime(this.state.remainingSeconds),
      text_size: 62,
    })
    this.addText({
      x: 140,
      y: 124,
      w: 200,
      h: 28,
      text: 'CRONÔMETRO DE TESTE',
      text_size: 18,
      color: COLORS.muted,
    })

    this.addTeamButton('blue', 24, 170, 'AZUL', COLORS.blue, this.state.blueScore)
    this.addTeamButton('red', 246, 170, 'VERMELHO', COLORS.red, this.state.redScore)

    this.addText({
      x: 36,
      y: 404,
      w: 408,
      h: 44,
      text: 'TOQUE EM UM TIME PARA MARCAR GOL',
      text_size: 19,
      color: COLORS.muted,
    })
  },

  addTeamButton(team, x, y, label, color, score) {
    const onClick = () => this.beginGoal(team)
    this.addClickArea({ x, y, w: 210, h: 214 }, onClick)
    this.bindClick(this.addPanel({ x: x + 18, y: y + 22, w: 174, h: 7, color, radius: 3 }), onClick)
    this.bindClick(this.addText({
      x: x + 10,
      y: y + 40,
      w: 190,
      h: 40,
      text: label,
      text_size: 24,
      color,
    }), onClick)
    this.bindClick(this.addText({
      x: x + 10,
      y: y + 76,
      w: 190,
      h: 104,
      text: `${score}`,
      text_size: 86,
    }), onClick)
    this.bindClick(this.addText({
      x: x + 10,
      y: y + 174,
      w: 190,
      h: 28,
      text: '+ GOL',
      text_size: 20,
      color: COLORS.lime,
    }), onClick)
  },

  beginGoal(team) {
    if (this.state.remainingSeconds === 0) return
    this.state.pendingTeam = team
    this.state.pendingScorer = null
    this.renderPlayerPicker('Quem fez o gol?', PLAYERS[team], (player) => {
      this.state.pendingScorer = player
      this.renderPlayerPicker(
        'Quem deu assistência?',
        ['Sem assistência', ...PLAYERS[team].filter((name) => name !== player)],
        (assist) => this.confirmGoal(assist),
      )
    })
  },

  renderPlayerPicker(title, players, onSelect, page = 0) {
    this.state.screen = 'player-picker'
    this.clearScreen()

    const teamLabel = this.state.pendingTeam === 'blue' ? 'AZUL +1' : 'VERMELHO +1'
    const teamColor = this.state.pendingTeam === 'blue' ? COLORS.blue : COLORS.red

    this.addPanel({ x: 0, y: 0, w: WIDTH, h: 480, color: COLORS.background })
    this.addText({
      x: 70,
      y: 18,
      w: 340,
      h: 38,
      text: teamLabel,
      text_size: 22,
      color: teamColor,
    })
    this.addText({
      x: 40,
      y: 58,
      w: 400,
      h: 50,
      text: title,
      text_size: 28,
    })

    const pageSize = 5
    const pageCount = Math.max(1, Math.ceil(players.length / pageSize))
    const safePage = Math.min(pageCount - 1, Math.max(0, page))
    const pagePlayers = players.slice(safePage * pageSize, (safePage + 1) * pageSize)

    pagePlayers.forEach((player, index) => {
      const y = 118 + index * 58
      const selectPlayer = () => onSelect(player)
      this.addClickArea({ x: 54, y, w: 372, h: 48, radius: 14 }, selectPlayer)
      this.bindClick(this.addText({
        x: 70,
        y,
        w: 340,
        h: 48,
        text: player,
        text_size: 22,
      }), selectPlayer)
    })

    const cancel = () => this.cancelGoal()
    this.addClickArea({ x: 180, y: 420, w: 120, h: 44, radius: 14 }, cancel)
    this.bindClick(this.addText({
      x: 180,
      y: 420,
      w: 120,
      h: 44,
      text: 'CANCELAR',
      text_size: 16,
      color: COLORS.warning,
    }), cancel)

    if (safePage > 0) {
      const previous = () => this.renderPlayerPicker(title, players, onSelect, safePage - 1)
      this.addClickArea({ x: 30, y: 420, w: 120, h: 44, radius: 14 }, previous)
      this.bindClick(this.addText({
        x: 30,
        y: 420,
        w: 120,
        h: 44,
        text: '< ANTERIOR',
        text_size: 15,
        color: COLORS.muted,
      }), previous)
    }

    if (safePage < pageCount - 1) {
      const next = () => this.renderPlayerPicker(title, players, onSelect, safePage + 1)
      this.addClickArea({ x: 330, y: 420, w: 120, h: 44, radius: 14 }, next)
      this.bindClick(this.addText({
        x: 330,
        y: 420,
        w: 120,
        h: 44,
        text: 'PROXIMO >',
        text_size: 15,
        color: COLORS.lime,
      }), next)
    }
  },

  confirmGoal(assist) {
    if (this.state.pendingTeam === 'blue') {
      this.state.blueScore += 1
    } else {
      this.state.redScore += 1
    }

    console.log(
      `Gol: ${this.state.pendingScorer}; assistência: ${assist}; time: ${this.state.pendingTeam}`,
    )
    this.state.pendingTeam = null
    this.state.pendingScorer = null
    this.renderScoreboard()
  },

  cancelGoal() {
    this.state.pendingTeam = null
    this.state.pendingScorer = null
    this.renderScoreboard()
  },

  showEndAlert() {
    if (this.state.alerting) return
    this.state.alerting = true
    this.stopTimer()
    this.clearScreen()

    this.addPanel({ x: 0, y: 0, w: WIDTH, h: 480, color: 0x210300 })
    this.addText({
      x: 30,
      y: 54,
      w: 420,
      h: 80,
      text: 'FIM DE JOGO!!',
      text_size: 48,
      color: COLORS.warning,
    })
    this.addText({
      x: 50,
      y: 150,
      w: 380,
      h: 100,
      text: `${this.state.blueScore}  ×  ${this.state.redScore}`,
      text_size: 72,
    })
    this.addText({
      x: 50,
      y: 248,
      w: 380,
      h: 38,
      text: 'AZUL        VERMELHO',
      text_size: 20,
      color: COLORS.muted,
    })
    const acknowledge = () => {
      this.stopEndAlert()
      this.renderFinishedScoreboard()
    }
    this.addClickArea({ x: 90, y: 324, w: 300, h: 86, radius: 24 }, acknowledge)
    this.bindClick(this.addText({
      x: 110,
      y: 324,
      w: 260,
      h: 86,
      text: 'OK',
      text_size: 34,
      color: COLORS.lime,
    }), acknowledge)

    this.state.vibrator.start({ mode: VIBRATOR_SCENE_TIMER })
    if (this.state.sounds.getEnabled()) {
      const alarmType = this.state.sounds.getSourceType().ALARM
      this.state.sounds.start(alarmType, 10)
    }
  },

  stopEndAlert() {
    if (this.state.vibrator) this.state.vibrator.stop()
    if (this.state.sounds) this.state.sounds.stop()
    this.state.alerting = false
  },

  renderFinishedScoreboard() {
    this.clearScreen()
    this.addPanel({ x: 0, y: 0, w: WIDTH, h: 480, color: COLORS.background })
    this.addText({
      x: 50,
      y: 72,
      w: 380,
      h: 48,
      text: 'TEMPO ENCERRADO',
      text_size: 28,
      color: COLORS.warning,
    })
    this.addText({
      x: 40,
      y: 145,
      w: 400,
      h: 130,
      text: `${this.state.blueScore}  ×  ${this.state.redScore}`,
      text_size: 86,
    })
    this.addText({
      x: 60,
      y: 275,
      w: 360,
      h: 40,
      text: 'AZUL        VERMELHO',
      text_size: 21,
      color: COLORS.muted,
    })
    this.addPanel({ x: 78, y: 342, w: 324, h: 70, color: COLORS.panel, radius: 20 })
    this.addText({
      x: 92,
      y: 342,
      w: 296,
      h: 70,
      text: 'ENCERRAR NO APP',
      text_size: 22,
      color: COLORS.lime,
    })
  },
})
