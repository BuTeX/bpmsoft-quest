export const mission37RoundA = Object.freeze({
  id: "37A",
  missionId: "37",
  title: "Поздняя версия расписания",
  briefing:
    "Сайт сначала показывает вылет в 10:40, а затем возвращает 09:55. Найдите первый подтверждённый сбой, настройте обработку и повторите тот же поток событий.",
  initialState: {
    segments: [
      {
        id: "OP-417-21JUL-SIP-GRD",
        flightNumber: "GA-417",
        serviceDate: "2026-07-21",
        route: "SIP→GRD",
        version: 3,
        departure: "09:55"
      },
      {
        id: "OP-417-21JUL-GRD-SKY",
        flightNumber: "GA-417",
        serviceDate: "2026-07-21",
        route: "GRD→SKY",
        version: 1,
        departure: "13:05"
      }
    ],
    activeSegmentId: "OP-417-21JUL-SIP-GRD",
    inboundEvent: null,
    rejectedEvents: [],
    notification: null,
    visualStatus: "normal"
  },
  actors: [
    { id: "schedule", label: "Система расписания", icon: "calendar" },
    { id: "bpmsoft", label: "BPMSoft", icon: "hub" },
    { id: "partner", label: "Партнёрский шлюз", icon: "link" },
    { id: "passenger", label: "Пассажир", icon: "person" }
  ],
  ticks: [
    {
      id: "T0",
      timeLabel: "08:00",
      title: "Исходное расписание",
      events: [{ id: "e0", type: "observe-initial-state", actorId: "schedule", targetId: "OP-417-21JUL-SIP-GRD", payload: {} }],
      journal: [
        { level: "info", text: "GA-417 · 21 июля · SIP→GRD: версия 3, вылет 09:55." }
      ]
    },
    {
      id: "T1",
      timeLabel: "08:12",
      title: "Получена новая версия",
      events: [
        {
          id: "e1",
          type: "receive-schedule-version",
          actorId: "schedule",
          targetId: "OP-417-21JUL-SIP-GRD",
          payload: { version: 4, departure: "10:40", createdAt: "08:12", source: "schedule" }
        }
      ],
      journal: [
        { level: "info", text: "Источник расписания передал версию 4: вылет 10:40, событие создано в 08:12." }
      ]
    },
    {
      id: "T2",
      timeLabel: "08:13",
      title: "Версия 4 опубликована",
      events: [
        {
          id: "e2",
          type: "apply-received-schedule-version",
          actorId: "bpmsoft",
          targetId: "OP-417-21JUL-SIP-GRD",
          payload: {}
        }
      ],
      journal: [
        { level: "success", text: "BPMSoft применил версию 4. Сайт и обращение показывают 10:40." }
      ]
    },
    {
      id: "T3",
      timeLabel: "08:16",
      title: "Пришло задержавшееся сообщение",
      events: [
        {
          id: "e3",
          type: "process-partner-schedule-version",
          actorId: "partner",
          targetId: "OP-417-21JUL-SIP-GRD",
          payload: {
            flightNumber: "GA-417",
            serviceDate: "2026-07-21",
            route: "SIP→GRD",
            version: 3,
            departure: "09:55",
            createdAt: "08:05",
            source: "partner"
          }
        }
      ],
      journal: [
        { level: "warning", text: "Партнёрский шлюз доставил версию 3, созданную раньше — в 08:05." }
      ]
    },
    {
      id: "T4",
      timeLabel: "08:17",
      title: "Подготовлено уведомление",
      events: [
        {
          id: "e4",
          type: "prepare-passenger-notification",
          actorId: "bpmsoft",
          targetId: "passenger",
          payload: {}
        }
      ],
      journal: [
        { level: "info", text: "Сервис коммуникаций готовит сообщение по текущему времени вылета." }
      ]
    }
  ],
  controls: [
    {
      id: "segment-key",
      label: "Ключ сопоставления сегмента",
      type: "single-choice",
      defaultValue: "flight-date-segment",
      options: [
        { value: "flight-only", label: "Только номер рейса", help: "Одинаковый номер может повторяться по датам и участкам." },
        { value: "flight-date", label: "Номер + дата", help: "Не различает отдельные сегменты составного маршрута." },
        { value: "flight-date-segment", label: "Номер + дата + сегмент", help: "Устойчиво различает операционный участок маршрута." }
      ]
    },
    {
      id: "version-policy",
      label: "Правило применения версии",
      type: "single-choice",
      defaultValue: "last-arrived",
      options: [
        { value: "last-arrived", label: "Последнее полученное", help: "Порядок доставки ошибочно принимается за порядок создания." },
        { value: "higher-only", label: "Только версия выше текущей", help: "Старая версия не откатывает актуальное состояние." }
      ]
    },
    {
      id: "rejection-policy",
      label: "Что делать с отклонённым событием",
      type: "single-choice",
      defaultValue: "discard",
      options: [
        { value: "discard", label: "Удалить без следа", help: "Повторная диагностика не сможет доказать причину отклонения." },
        { value: "keep-with-reason", label: "Сохранить с причиной", help: "Событие остаётся наблюдаемым, но не меняет запись." }
      ]
    }
  ],
  guidance: {
    confirmedControls: ["segment-key"]
  },
  solution: {
    firstDivergenceTickId: "T3",
    acceptedConfigurations: [
      {
        "segment-key": "flight-date-segment",
        "version-policy": "higher-only",
        "rejection-policy": "keep-with-reason"
      }
    ],
    requiredOutcomes: [
      "current-version-4",
      "stale-event-rejected",
      "rejection-auditable",
      "notification-uses-version-4"
    ],
    forbiddenOutcomes: [
      "ambiguous-segment-key",
      "stale-version-applied",
      "stale-notification-prepared",
      "rejected-event-lost"
    ]
  },
  feedback: {
    passed: "Версия 3 отклонена на первом проблемном такте, её причина видна в журнале, а уведомление использует 10:40.",
    "checkpoint-error": "Настройка защищает данные, но отмечен поздний симптом. Найдите такт, где система впервые принимает неверное решение.",
    "rule-error": "Момент найден верно, однако контрольный прогон всё ещё нарушает одно из ограничений.",
    "mixed-error": "И момент, и правила требуют пересмотра. Сопоставьте время создания версии с временем её доставки."
  },
  presentation: {
    scene: "schedule-ring",
    focusEntityId: "OP-417-21JUL-SIP-GRD"
  }
});
