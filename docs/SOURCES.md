# Источники BPMSoft Quest

Актуально на 2026-07-20.

Локальная база материалов находится здесь:

```text
/Users/viktordulec/Yandex.Disk-v.dulec.localized/Codex/Learning/00_raw/vendor/bpmsoft
```

Это источники фактов, а не активная копия приложения.

## Использованные документы

| Область | Локальный файл |
|---|---|
| терминология платформы | `education/glossariy.md` |
| интерфейс и страницы раздела | `platform/interfeys-bpmsoft.md`, `basic-customization/stranitsy-razdela.md` |
| права доступа | `platform/prava-dostupa.md` |
| бизнес-процессы | `platform/biznes-protsessy.md` |
| лиды и email-сценарии | `sales/voprosy-i-otvety-o-lidakh.md` |
| настройка DCM-кейса | `case-management/nastroyka-keysa.md` |
| дизайнер кейсов | `case-management/dizayner-keysov.md` |
| входящие webhook | `integrations/nastroyka-integratsii-vebkhukov.md` |
| дашборды и аналитика | `platform/dashbordy-i-analitika.md`, `platform/analitika.md` |
| аналитика обращений и SLA | `service/obrascheniya.md` |
| нагрузка операторов | `service/edinoe-okno.md` |
| стандартная карточка контакта и лицензионные ограничения | `constructor/kontakty.md` |
| импорт Excel и поиск дублей | `platform/import-dannykh.md` |
| no-code страницы раздела | `basic-customization/stranitsy-razdela.md` |
| справочники и справочные поля | `basic-customization/spravochniki.md` |
| центр уведомлений | `platform/tsentr-uvedomleniy.md` |
| исходящие REST/SOAP интеграции | `integrations/nachalo-raboty-s-integraciej-veb-servisov.md` |
| клиентская разработка | `development/klientskie-skhemy.md` |
| серверная разработка и кастомные API | `development/servernye-skhemy.md`, `development/veb-servisy-i-api.md` |

## Как работать с источниками для миссии 08

Для каждого из 12 требований:

1. найти подтверждение базового функционала или настраиваемого механизма;
2. записать точный файл-источник в содержательную спецификацию;
3. не считать функцию коробочной только по общему знанию CRM;
4. отделять low-code настройку от интеграции;
5. назначать «Разработка» только при подтверждённом отсутствии коробочного/low-code пути;
6. назначать `TBD`, если классификация зависит от лицензии, объёма, нефункциональных требований или неизвестного внешнего контракта.

## Как работать с источниками для миссии 09

Сборка мини-решения разделена на шесть самостоятельных узлов: раздел/карточка, справочник, роли и права, DCM-кейс, BPMN-процесс уведомления и дашборд. Проверять не только наличие каждого механизма, но и его границу ответственности: поле «Ответственный» не заменяет права по записям, статус не заменяет DCM-кейс, ручное письмо не заменяет автоматизацию, а печатный отчёт — оперативный дашборд.

## Иерархия доверия

1. локальная документация BPMSoft нужной версии;
2. существующие wiki-конспекты со ссылкой на vendor-doc;
3. продуктовая формулировка миссии;
4. предположение — только с явной пометкой `TBD`.

Если локального материала недостаточно и требуется интернет, использовать только актуальные первичные источники BPMSoft и записать ссылку рядом с требованием.
