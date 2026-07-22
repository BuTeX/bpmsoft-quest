# Источники BPMSoft Quest

Актуально на 2026-07-21.

Локальная база материалов:

```text
/Users/viktordulec/Yandex.Disk-v.dulec.localized/Codex/Learning/00_raw/vendor/bpmsoft
```

Это источник продуктовых фактов, а не активная копия приложения.

## Карта документов

| Область | Локальные файлы |
|---|---|
| Терминология | `education/glossariy.md` |
| Интерфейс и страницы | `platform/interfeys-bpmsoft.md`, `basic-customization/stranitsy-razdela.md` |
| Данные и справочники | `basic-customization/spravochniki.md`, `platform/import-dannykh.md` |
| Права доступа | `platform/prava-dostupa.md` |
| Бизнес-процессы | `platform/biznes-protsessy.md` |
| DCM-кейсы | `case-management/nastroyka-keysa.md`, `case-management/dizayner-keysov.md` |
| Webhook | `integrations/nastroyka-integratsii-vebkhukov.md` |
| Исходящие веб-сервисы | `integrations/nachalo-raboty-s-integraciej-veb-servisov.md`, `integrations/nastroit-autentifikatsiyu-veb-servisa.md` |
| Аналитика | `platform/dashbordy-i-analitika.md`, `platform/analitika.md` |
| Лиды и продажи | `sales/voprosy-i-otvety-o-lidakh.md` |
| Обращения и SLA | `service/obrascheniya.md`, `service/edinoe-okno.md` |
| Портал | `portal/obzor-portalnykh-resheniy.md`, `portal/polzovateli-portala.md`, `portal/administrirovanie-organizatsii-i-polzovateley-na-portale.md` |
| Пакеты и конфигурация | `development/konfiguratsiya-i-pakety.md`, `development/skhemy-obektov.md` |
| Журналы и аудит | `platform/zhurnalirovanie.md` |
| Изменения и релизы | `service/problemy.md`, `service/izmeneniya.md`, `service/relizy.md`, `service/konfiguratsionnye-edinitsy.md` |
| Клиентская и серверная разработка | `development/klientskie-skhemy.md`, `development/servernye-skhemy.md`, `development/veb-servisy-i-api.md` |
| AI, ML и LLM | `ai/iskusstvennyy-intellekt-v-bpmsoft.md`, `ai/nastroyka-ai-instrumentov.md`, `ai/nastroyka-ml-modeley.md`, `ai/podklyuchenie-k-servisu-mashinnogo-obucheniya.md` |

## Профильные источники заданий 37–45

| Область | Официальный источник BPMSoft | Использование в пятой карте |
|---|---|---|
| Объекты и связи | [Кастомизация No-code](https://edu.bpmsoft.ru/baza-znaniy/kastomizatsiya-no-code-1.0/?version=1.9) | основа проектной модели рейса, сегмента и связанных номеров |
| SLA и календари | [Время реакции и разрешения](https://edu.bpmsoft.ru/baza-znaniy/obrabotka-obrashcheniy/opredelenie-srokov-reaktsii-i-razresheniya/?version=1.9) | правила по сервису, договору, приоритету и календарю |
| Входящие события | [Настройка интеграции вебхуков](https://edu.bpmsoft.ru/baza-znaniy/veb-servisy/nastroyka-integratsii-vebkhukov/?version=1.9) | приём внешнего события и запуск процесса/действия |
| Кейсы | [Настройка кейса](https://edu.bpmsoft.ru/baza-znaniy/lenta-stadiy-v-razdelakh/nastroyka-keysa/?version=1.9) | стадии и шаги вариативной пассажирской ситуации |
| Процессы | [Бизнес-процессы](https://edu.bpmsoft.ru/baza-znaniy/biznes-protsessy/?version=1.9) | автоматические действия, ветвления и пользовательские задачи |
| Права | [Виды прав доступа](https://edu.bpmsoft.ru/baza-znaniy/polzovateli-i-prava-dostupa/vidy-prav-dostupa/?version=1.9) | операции, записи и колонки |
| Портал | [Права доступа на портале](https://edu.bpmsoft.ru/baza-znaniy/administrirovanie-portala/prava-dostupa-na-portale/?version=1.9) | минимальные привилегии и изоляция партнёров |
| Делегирование | [Передача прав доступа](https://edu.bpmsoft.ru/baza-znaniy/polzovateli-i-prava-dostupa/delegirovanie/?version=1.8) | период действия и актуализация ролей |
| Исходящие интеграции | [Интеграции No-code](https://edu.bpmsoft.ru/baza-znaniy/veb-servisy/?version=1.9) | вызов REST/SOAP-сервисов и аутентификация |
| Наблюдаемость процессов | [Журнал процессов](https://edu.bpmsoft.ru/baza-znaniy/soprovozhdenie-protsessov/razdel-zhurnal-protsessov/?version=1.9) | статус, время, ошибки и связанные объекты экземпляра процесса |
| ML | [Модели машинного обучения](https://edu.bpmsoft.ru/baza-znaniy/nastroyka-ml-modeley/nastroennye-modeli-mashinnogo-obucheniya/?version=1.9) | прогноз на исторических и текущих данных |
| Обучение ML | [Обучение модели](https://edu.bpmsoft.ru/baza-znaniy/nastroyka-ml-modeley/nastroyka-i-obuchenie/?version=1.9) | экземпляр/версия модели после обучения |
| ML в процессе | [Бизнес-процесс с ML-моделью](https://edu.bpmsoft.ru/baza-znaniy/nastroyka-ml-modeley/nastroyka-biznes-protsessa/?version=1.9) | прогноз как вход в управляемый процесс |

## Иерархия доверия

1. Локальная документация BPMSoft нужной версии.
2. Внутренняя wiki со ссылкой на исходный vendor-документ.
3. Продуктовая спецификация задания.
4. Предположение только с явной пометкой `TBD`.

Если локального материала недостаточно, использовать актуальный первичный источник BPMSoft и записать ссылку рядом с требованием.

## Правила работы с источником

- Факт о функции платформы подтверждается до написания варианта ответа.
- Название компании и роль заказчика не считаются источником знания о BPMSoft.
- Художественная метафора не может расширять возможности платформы.
- Если выбор зависит от лицензии, контракта, объёма или нефункционального требования, ответ остаётся `TBD` до уточнения.
- Разработка выбирается только после проверки коробочного, low-code и интеграционного пути.
- Для каждого правильного ответа фиксируется граница: что механизм делает и чего не заменяет.

## Критичные границы заданий 01–09

- рабочее место, раздел, реестр, карточка и деталь имеют разные уровни интерфейса;
- объект, поле, справочник, связь и деталь не взаимозаменяемы;
- роль не заменяет право по записи или колонке;
- статус не заменяет DCM-кейс;
- ручное письмо не заменяет управляемый процесс;
- повторный webhook требует устойчивого внешнего идентификатора;
- тип виджета выбирается под управленческий вопрос;
- `TBD` используется при реальной нехватке данных;
- минимальное решение принимается сценариями регистрации, доступа и эскалации.

## Критичные границы заданий 10–18

- условия поиска дубля объединяются через И, пустые ячейки не очищают заполненные поля;
- портал не отменяет права по записям и колонкам;
- секреты вводятся на целевой среде и не поставляются как открытое значение;
- актуальная версия процесса, журналирование и сериализация решают разные задачи;
- поставочный пакет не изменяется напрямую, циклические зависимости запрещены;
- журнал изменений и аудит отвечают на разные вопросы;
- проблема, изменение, релиз и работа — разные сущности;
- ML и LLM требуют данных, лицензии и проверяемого процесса;
- итоговая приёмка опирается на наблюдаемый симптом и контрольный сценарий.

## Критичные границы заданий 19–27

- контакт, контрагент, коммуникация и обращение — разные части клиентского контекста;
- лид хранит интерес до квалификации;
- канал сохраняет источник и согласие;
- BPMN-элементы имеют разные исполняемые роли;
- реакция и разрешение — разные SLA-метрики;
- операции, объекты, записи и колонки — разные уровни доступа;
- входящий webhook и исходящий REST имеют разное направление;
- ML решает прогнозные задачи, LLM — генеративные;
- итоговая приёмка требует журналов, связанных записей и бизнес-результата.

## Критичные границы заданий 28–36

- поиск и объединение дублей требует правил сопоставления и разбора связанных данных: [BPMSoft — поиск и объединение дублей](https://edu.bpmsoft.ru/baza-znaniy/rabota-s-dannymi/poisk-i-obedinenie-dubley/);
- кампания хранит аудиторию и маршрут, но проект должен отдельно определить согласия и фактическую конверсию: [BPMSoft — раздел «Кампании»](https://edu.bpmsoft.ru/baza-znaniy/marketingovye-kampanii/razdel-kampanii/?version=1.9);
- портал не отменяет разграничение операций, объектов, записей и полей: [BPMSoft — права доступа на портале](https://edu.bpmsoft.ru/baza-znaniy/administrirovanie-portala/prava-dostupa-na-portale/?version=1.9);
- заказ и его позиции должны оставаться структурированными бизнес-записями: [BPMSoft — раздел «Заказы»](https://edu.bpmsoft.ru/baza-znaniy/korotkie-prodazhi/razdel-zakazy/);
- сведения о продукте и остатках не заменяют проектную модель резерва и версий интеграционных событий: [BPMSoft — раздел «Продукты»](https://edu.bpmsoft.ru/baza-znaniy/katalog-produktov/razdel-produkty/?version=1.9);
- ключ идемпотентности компенсации, составная модель согласий и доступный остаток описываются как проектные решения, а не как неподтверждённые коробочные функции.

## Критичные границы заданий 37–45

- BPMSoft предоставляет средства моделирования объектов, но состав идентификатора рейса/сегмента и правила версий являются проектным контрактом «Гуд Авиа»;
- абсолютный момент времени, локальная подпись и рабочий календарь нельзя смешивать; штатный SLA BPMSoft учитывает правило и календарь;
- webhook принимает внешнее событие, но внешний `eventId`, последовательность и идемпотентность задаются интеграционным контрактом;
- кейс управляет вариативным жизненным циклом, а процесс автоматизирует исполняемые шаги; один не является универсальной заменой другого;
- видимый фильтр портала не заменяет права по записи и колонке, а временное делегирование требует проверки окончания периода и актуализации ролей;
- таймаут означает неизвестный исход, пока внешний результат не подтверждён; correlation ID, operation key и политика повторов являются проектными решениями;
- ML-прогноз помогает ранжировать или рекомендовать, но высоковлияющее действие остаётся частью контролируемого бизнес-процесса;
- успешный финальный статус не засчитывается, если по пути возник дубль, лишний доступ, потеря корреляции или преждевременная коммуникация.
