# Пятая карта — контракт симуляции `operational-twin`

Актуально на 2026-07-21. Статус: спецификация Этапа 3. Контракт предшествует UI и является основой вертикального прототипа.

Связанные документы: [`CHAPTER_5_MISSIONS.md`](CHAPTER_5_MISSIONS.md), [`CHAPTER_5_PRODUCT_SPEC.md`](CHAPTER_5_PRODUCT_SPEC.md), [`CHAPTER_5_IMPLEMENTATION_PLAN.md`](CHAPTER_5_IMPLEMENTATION_PLAN.md).

## 1. Цель контракта

Один и тот же сценарий должен одинаково исполняться:

- чистым JavaScript-движком в автоматическом тесте;
- визуальной сценой с самолётами, потоками и состояниями зон;
- текстовым журналом;
- интерфейсом без анимации при `prefers-reduced-motion`;
- после восстановления сохранённого черновика.

DOM, частота кадров, CSS-анимация, время компьютера и случайность не участвуют в расчёте результата.

## 2. Дискретная модель времени

Сценарий состоит из упорядоченных тактов `T0…Tn`. Такт — атомарная группа уже подтверждённых событий.

Правила исполнения:

1. движок начинает с канонического `initialState`;
2. при переходе к следующему такту применяются все его события в порядке массива;
3. после событий рассчитываются наблюдаемые состояния и outcomes;
4. checkpoint относится к состоянию **после** применения такта;
5. переход назад не отменяет события по одному, а заново воспроизводит сценарий от `initialState` до выбранного такта;
6. контрольный прогон всегда начинается с `T0` и тех же входных событий;
7. управляемая конфигурация влияет на правила обработки, но не меняет входные события.

Один такт не равен реальной секунде. UI может показывать деловое время события, но движок сравнивает только индекс такта и явно переданные значения.

## 3. Конфигурационная модель

Ниже приведена нормативная логическая схема. Синтаксис близок к TypeScript только для ясности и не требует подключения TypeScript.

```ts
type Chapter5Mission = {
  id: "37" | "38" | "39" | "40" | "41" | "42" | "43" | "44" | "45";
  zone: string;
  title: string;
  xp: 80 | 160;
  rounds: SimulationRound[];
};

type SimulationRound = {
  id: string;                    // например, "37A"
  title: string;
  briefing: string;
  initialState: Record<string, unknown>;
  actors: ActorDefinition[];
  ticks: TimelineTick[];
  controls: RuleControl[];       // от 2 до 3
  solution: RoundSolution;
  feedback: FeedbackDictionary;
  presentation: RoundPresentation;
};

type TimelineTick = {
  id: string;                    // T0, T1, ... без пропусков
  timeLabel: string;
  title: string;
  events: SimulationEvent[];
  journal: JournalEntry[];
};

type SimulationEvent = {
  id: string;
  type: string;
  actorId: string;
  targetId: string;
  payload: Record<string, unknown>;
};

type RuleControl = {
  id: string;
  label: string;
  type: "single-choice";
  defaultValue: string;
  options: Array<{ value: string; label: string; help: string }>;
};

type RoundSolution = {
  firstDivergenceTickId: string;
  acceptedConfigurations: Array<Record<string, string>>;
  requiredOutcomes: string[];
  forbiddenOutcomes: string[];
};
```

Ограничения данных:

- ID миссий, раундов, тактов, событий, actors, controls и options уникальны в своей области;
- `ticks[0].id === "T0"`, далее номера возрастают без пропусков;
- первый checkpoint входит в `ticks` и не может быть `T0`, если расхождение ещё не наблюдаемо;
- у каждого control есть default и этот default входит в options;
- конфигурация решения содержит значение каждого control;
- один раунд имеет от 5 до 7 тактов и от 2 до 3 controls;
- входные события не содержат функции, даты JavaScript, DOM-узлы или случайные значения;
- тексты журнала и визуальные команды не являются источником истины для оценки.

## 4. Runtime-состояние

```ts
type SimulationStatus =
  | "idle"
  | "running"
  | "paused"
  | "diagnosing"
  | "configured"
  | "verifying"
  | "passed"
  | "failed";

type SimulationRuntime = {
  missionId: string;
  roundId: string;
  status: SimulationStatus;
  runKind: "baseline" | "verification";
  tickIndex: number;
  baselineCompleted: boolean;
  selectedCheckpointId: string | null;
  controlValues: Record<string, string>;
  computedState: Record<string, unknown>;
  outcomes: string[];
  verification: VerificationResult | null;
};
```

`computedState` всегда получается повторным применением событий от `initialState`; UI не имеет права напрямую менять его.

## 5. Переходы состояний

| Текущее состояние | Действие | Следующее состояние | Условие |
|---|---|---|---|
| `idle` | `START_BASELINE` | `running` | всегда |
| `running` | `PAUSE` | `paused` | не достигнут последний такт |
| `running` | `ADVANCE` | `running` | есть следующий такт |
| `running` | `ADVANCE` | `diagnosing` | достигнут последний такт baseline |
| `paused` | `ADVANCE` / `REWIND` / `SEEK` | `paused` | только посещённые baseline-такты |
| `paused` | `RESUME` | `running` | есть следующий такт |
| `diagnosing` | `SELECT_CHECKPOINT` | `diagnosing` | baseline завершён |
| `diagnosing` | `SET_CONTROL` | `configured` | checkpoint выбран и все controls валидны |
| `configured` | `SET_CONTROL` | `configured` | значение входит в options |
| `configured` | `START_VERIFICATION` | `verifying` | checkpoint и конфигурация заполнены |
| `verifying` | `ADVANCE` | `verifying` | есть следующий такт |
| `verifying` | `ADVANCE` | `passed` / `failed` | последний такт и выполнена оценка |
| `failed` | `RETURN_TO_DIAGNOSIS` | `diagnosing` | попытки остались |
| `passed` | `OPEN_NEXT_ROUND` | `idle` | есть следующий раунд |

Дополнительные правила:

- `SEEK` не разрешён во время verification: контрольный прогон должен быть просмотрен целиком;
- пользователь может поставить verification на паузу, но не менять controls до возврата в диагностику;
- `REPLAY_BASELINE` сбрасывает checkpoint и controls к default, но не тратит попытку;
- изменение скорости воспроизведения влияет только на UI-таймер;
- достижение последнего такта baseline не оценивает ответ и не тратит попытку;
- закрытие окна не является ошибкой и не тратит попытку.

## 6. Чистые операции движка

Движок должен экспортировать небольшие чистые функции:

```ts
validateRound(round) -> ValidationResult
createRuntime(round) -> SimulationRuntime
reduceRuntime(round, runtime, action) -> SimulationRuntime
replayToTick(round, configuration, tickIndex) -> ComputedRun
evaluateRound(round, checkpointId, configuration, computedRun) -> VerificationResult
```

Требования:

- функции не читают и не пишут `localStorage`, DOM, cookie или системное время;
- входные объекты не мутируются;
- одинаковые аргументы дают структурно одинаковый результат;
- неизвестное действие и недопустимый переход завершаются контролируемой ошибкой контракта;
- UI получает готовые outcomes и не вычисляет правильность сам.

## 7. Оценка решения

```ts
type VerificationResult = {
  status: "passed" | "checkpoint-error" | "rule-error" | "mixed-error";
  checkpointCorrect: boolean;
  controls: Record<string, "correct" | "incorrect">;
  missingRequiredOutcomes: string[];
  firstForbiddenOutcome: string | null;
  feedbackKey: string;
};
```

Алгоритм:

1. сравнить выбранный checkpoint с `firstDivergenceTickId`;
2. проверить конфигурацию против каждой допустимой конфигурации;
3. воспроизвести все такты с выбранной конфигурацией;
4. убедиться, что все `requiredOutcomes` появились;
5. найти первый по времени `forbiddenOutcome`;
6. вернуть `passed` только при правильном checkpoint, допустимой конфигурации, наличии обязательных и отсутствии запрещённых outcomes.

Финальный «зелёный» статус не отменяет нарушения на промежуточном такте. Если дубль создан на `T2`, а на `T4` одна из записей удалена, outcome `duplicate-created` всё равно делает прогон ошибочным.

## 8. Попытки и учебная обратная связь

- у миссии четыре попытки;
- попытка расходуется только после завершённого verification с результатом не `passed`;
- пауза, перемотка, baseline и изменение controls попытку не расходуют;
- после ошибки игрок видит: точен ли checkpoint, первый запрещённый outcome и статусы controls без раскрытия правильных значений;
- подтверждённо корректные controls можно оставить зафиксированными;
- после четвёртой ошибки перезапускается только активный раунд, baseline-журнал остаётся доступным;
- в режиме изучения runtime использует те же правила, но попытки и прогресс не отправляются на сервер.

XP начисляется один раз после завершения последнего раунда миссии. Повтор пройденной миссии не меняет XP.

## 9. Сериализация

Ключ клиента: `bpmsoft-quest-chapter5-v1`.

Сохраняется:

```json
{
  "version": 1,
  "activeMissionId": "37",
  "activeRoundId": "37A",
  "completedMissionIds": [],
  "completedRoundIds": [],
  "attemptsByMission": { "37": 4 },
  "drafts": {
    "37A": {
      "selectedCheckpointId": "T3",
      "controlValues": {
        "segment-key": "flight-date-segment",
        "version-policy": "higher-only",
        "rejection-policy": "keep-with-reason"
      }
    }
  },
  "introSeen": false,
  "finaleSeen": false
}
```

Не сохраняется:

- `status`, `runKind`, текущий tick и UI-таймер;
- `computedState` и outcomes — они пересчитываются из данных раунда;
- координаты, CSS-классы и состояние декоративных анимаций;
- XP и уровень как доверенные клиентские числа — сервер выводит их из непрерывного прогресса.

После восстановления незавершённый раунд открывается на паузе у выбранного checkpoint либо на `T0`, если checkpoint не выбран. Verification никогда не продолжается с середины после перезагрузки.

Серверная канонизация обязана:

- принимать только известные поля и IDs;
- требовать непрерывное завершение миссий `37 → 45` в режиме прохождения;
- требовать порядок раундов внутри миссии;
- ограничивать попытки диапазоном `0…4`;
- выводить XP из завершённых миссий;
- не принимать прогресс режима изучения;
- отвергать состояние пятой карты, переданное в ключе другой главы.

## 10. Представление и доступность

Визуальная сцена и журнал получают единый snapshot:

```ts
{
  tickId,
  actors,
  entities,
  outcomes,
  journalEntries,
  presentationCommands
}
```

Требования к UI:

- каждое визуально значимое событие имеет текстовую запись;
- такты выбираются кнопками и стрелками, drag не обязателен;
- состояние обозначается текстом/иконкой/формой, цвет только дополняет;
- live region сообщает новый такт, но не перечитывает весь журнал;
- фокус не перескакивает при автоматическом ADVANCE;
- на mobile сцена и журнал могут быть вкладками, но показывают одинаковый tick;
- reduced motion отменяет перемещения между состояниями, но сохраняет play/pause и порядок тактов;
- декоративные облака не включаются в `presentationCommands` и не влияют на snapshot.

## 11. Канонический пример 37A

Controls:

| ID | Default | Правильное значение |
|---|---|---|
| `segment-key` | `flight-date-segment` | `flight-date-segment` |
| `version-policy` | `last-arrived` | `higher-only` |
| `rejection-policy` | `discard` | `keep-with-reason` |

Outcomes baseline:

| Такт | Outcome |
|---|---|
| T2 | `current-version-4` |
| T3 | `stale-version-applied` |
| T4 | `stale-notification-prepared` |

Required outcomes verification:

- `current-version-4`;
- `stale-event-rejected`;
- `rejection-auditable`;
- `notification-uses-version-4`.

Forbidden outcomes:

- `duplicate-segment-created`;
- `stale-version-applied`;
- `stale-notification-prepared`;
- `rejected-event-lost`.

## 12. Детерминированные примеры проверки

| Checkpoint | Конфигурация | Ожидаемый результат |
|---|---|---|
| `T3` | все три правильных значения | `passed` |
| `T4` | все три правильных значения | `checkpoint-error`, поздний симптом |
| `T3` | `last-arrived`, остальные правильные | `rule-error`, первый запрет `stale-version-applied` |
| `T3` | `higher-only`, но `discard` | `rule-error`, первый запрет `rejected-event-lost` |
| `T2` | default | `mixed-error` |

Обязательные тесты прототипа:

1. два полных прогона с одинаковыми входами дают глубокое равенство snapshot и result;
2. перемотка `T4 → T1 → T4` даёт тот же snapshot, что прямой прогон до `T4`;
3. baseline всегда воспроизводит дефект;
4. правильная конфигурация не меняет входные события;
5. поздний checkpoint не проходит даже при правильной конфигурации;
6. промежуточный forbidden outcome нельзя скрыть последующим исправлением;
7. невалидные ID и значения controls отклоняются валидатором;
8. сериализация и восстановление не продолжают verification с середины;
9. reduced motion не меняет последовательность snapshots;
10. проверка не импортирует DOM и запускается в Node.

## 13. Ворота Этапа 3

Контракт готов к прототипированию, когда:

- схема покрывает все поля, необходимые миссиям 37–45;
- движок можно реализовать как чистый модуль без браузера;
- определены все разрешённые переходы состояния;
- checkpoint, controls, required и forbidden outcomes оцениваются независимо;
- сохранение не доверяет вычисляемым клиентским значениям;
- канонический пример 37A имеет однозначные тестовые результаты;
- UI может быть полностью заменён текстовым представлением без потери решаемости.

Следующий шаг — Этап 4: реализовать чистый движок и один вертикальный срез 37A на временной графике, затем проверить desktop, mobile, keyboard и reduced motion до производства финальных панорам.
