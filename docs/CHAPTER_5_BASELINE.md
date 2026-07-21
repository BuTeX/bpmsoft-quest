# Пятая карта — исходная точка перед реализацией

Зафиксировано 2026-07-21 в рамках Этапа 0 плана [`CHAPTER_5_IMPLEMENTATION_PLAN.md`](CHAPTER_5_IMPLEMENTATION_PLAN.md).

## Результат

Исходная версия подтверждена. Можно начинать продуктовый канон пятой карты, не смешивая его с незавершёнными изменениями четвёртой карты.

## Автоматическая регрессия

Команда:

```bash
npm test
```

Результат:

- задания 01–09: OK;
- состояние и задания 10–18: OK;
- состояние и задания 19–27: OK;
- состояние и задания 28–36: OK;
- серверные тесты: `14 passed`, `0 failed`;
- полный процесс завершён с кодом `0`.

Первый запуск серверных тестов внутри ограниченной песочницы не смог открыть `127.0.0.1` (`EPERM`). Повтор той же команды с разрешением на локальный тестовый порт прошёл полностью. Это ограничение среды запуска, а не дефект приложения.

## Состояние рабочей копии до кода пятой карты

На старте уже существовали незавершённые изменения пользователя:

- `chapter4.css`;
- `chapter4.js`;
- `index.html`;
- `test-chapter4-missions.mjs`.

Их не считать изменениями пятой карты, не откатывать и не перезаписывать без отдельной необходимости. Документация пятой карты и концепт-арты добавлены отдельно.

## Браузерная проверка

Проверка выполнена через локальный сервер `http://127.0.0.1:4173/` во временном аккаунте режима изучения. Аккаунт существовал только во временном серверном хранилище текущего запуска.

- заголовок страницы: `Академия Гуд программ | BPMSoft Quest`;
- тёплая локальная перезагрузка до события `load`: около `48 ms` — только ориентир, не производительный бюджет;
- переключение между четырьмя картами работает;
- все 36 заданий доступны в режиме изучения;
- предупреждения и ошибки консоли: `0`.

### Геометрия экранов

| Карта | Desktop viewport | Высота документа | Horizontal overflow | Mobile viewport | Высота документа | Horizontal overflow |
|---|---:|---:|---|---:|---:|---|
| Академия | `1440 × 1000` | `1172` | нет | `390 × 844` | `1279` | нет |
| Медные машины | `1440 × 1000` | `1056` | нет | `390 × 844` | `1633` | нет |
| Семь дорог | `1440 × 1000` | `1000` | нет | `390 × 844` | `2010` | нет |
| Золотая полка | `1440 × 1000` | `1000` | нет | `390 × 844` | `2010` | нет |

## Эталонные снимки

Desktop:

- [`baseline/chapter5-stage0/desktop-chapter1-academy.png`](baseline/chapter5-stage0/desktop-chapter1-academy.png);
- [`baseline/chapter5-stage0/desktop-chapter2-copper-machines.png`](baseline/chapter5-stage0/desktop-chapter2-copper-machines.png);
- [`baseline/chapter5-stage0/desktop-chapter3-seven-roads.png`](baseline/chapter5-stage0/desktop-chapter3-seven-roads.png);
- [`baseline/chapter5-stage0/desktop-chapter4-golden-shelf.png`](baseline/chapter5-stage0/desktop-chapter4-golden-shelf.png).

Mobile:

- [`baseline/chapter5-stage0/mobile-chapter1-academy.png`](baseline/chapter5-stage0/mobile-chapter1-academy.png);
- [`baseline/chapter5-stage0/mobile-chapter2-copper-machines.png`](baseline/chapter5-stage0/mobile-chapter2-copper-machines.png);
- [`baseline/chapter5-stage0/mobile-chapter3-seven-roads.png`](baseline/chapter5-stage0/mobile-chapter3-seven-roads.png);
- [`baseline/chapter5-stage0/mobile-chapter4-golden-shelf.png`](baseline/chapter5-stage0/mobile-chapter4-golden-shelf.png).

## Исходная структура сохранений

Локальные ключи:

```text
bpmsoft-quest-v1
bpmsoft-quest-chapter2-v1
bpmsoft-quest-chapter3-v1
bpmsoft-quest-chapter4-v1
```

Сервер хранит отдельные пары:

```text
chapter1_state / chapter1_score
chapter2_state / chapter2_score
chapter3_state / chapter3_score
chapter4_state / chapter4_score
```

API прогресса принимает главы `chapter1|chapter2|chapter3|chapter4`. Пятая карта пока отсутствует во всех трёх слоях — клиент, сервер и PostgreSQL — и будет добавляться только после утверждения симуляционного контракта.

## Ворота Этапа 0

- полный тестовый набор зелёный;
- исходные незавершённые изменения перечислены;
- desktop/mobile-эталоны сохранены;
- горизонтального переполнения и ошибок консоли нет;
- структура сохранений зафиксирована.

Этап 0 завершён. Следующий шаг — Этап 1: продуктовый канон «Гуд Авиа».
