<p align="center">
  <img src=".github/assets/banner.png" alt="pinn. – семейный органайзер, который живёт на вашем NAS" width="880">
</p>

<p align="center">
  <a href="https://github.com/pinn-shost/pinn/releases/latest"><img src="https://img.shields.io/github/v/release/pinn-shost/pinn?style=flat-square&color=2F4B41&label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/pinn-shost/pinn?style=flat-square&color=2F4B41" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/runs%20on-Docker-2F4B41?style=flat-square&logo=docker&logoColor=white" alt="Runs on Docker">
  <img src="https://img.shields.io/badge/backend-PocketBase-2F4B41?style=flat-square" alt="PocketBase">
  <img src="https://img.shields.io/badge/iPhone%20%7C%20iPad%20%7C%20Android-installable%20web%20app-2F4B41?style=flat-square" alt="iPhone, iPad and Android">
  <a href="https://ko-fi.com/pinnapp"><img src="https://img.shields.io/badge/Ko--fi-support-C28A33?style=flat-square&logo=kofi&logoColor=white" alt="Support on Ko-fi"></a>
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> ·
  <a href="README.de.md">🇩🇪 Deutsch</a> ·
  <a href="README.es.md">🇪🇸 Español</a> ·
  <a href="README.fr.md">🇫🇷 Français</a> ·
  <a href="README.it.md">🇮🇹 Italiano</a> ·
  <a href="README.pt.md">🇧🇷 Português</a> ·
  <a href="README.zh.md">🇨🇳 中文</a> ·
  <a href="README.ja.md">🇯🇵 日本語</a> ·
  <a href="README.ko.md">🇰🇷 한국어</a> ·
  <b>🇷🇺 Русский</b>
</p>

---

pinn. – это одно приложение для всего, что нужно дому: общий календарь, меню на неделю, список покупок, чья очередь выносить мусор, карманные деньги и страховка, которую нужно расторгнуть в марте. Оно работает на **вашем NAS** в Docker и устанавливается как обычное приложение на каждый iPhone, iPad и телефон с Android.

Никаких облачных аккаунтов. Никаких подписок. Ни рекламы, ни слежки. Данные вашей семьи не покидают ваш дом.

> Это краткое описание. Полное описание с картинками, FAQ и структурой репозитория – в [English README](README.md) и [Deutsch](README.de.md).

## Что умеет pinn.

- 📅 **Календарь** – общий календарь семьи, подключение iCloud и Google, праздники и школьные каникулы
- ✅ **Задачи и дом** – задачи, очередь по кругу, мусор, уборка, «Кто сколько делает?»
- 🍽️ **Еда** – меню на неделю, рецепты с импортом, кладовая со сканером, список покупок
- 💶 **Финансы** – расходы, бюджет, кассы с взаиморасчётами, договоры со сроками, карманные деньги
- 👨‍👩‍👧 **Семья** – аварийные карточки, геопозиция, SOS, «Я иду домой», питомцы, школа и детский сад
- 🏠 **Дом и транспорт** – счётчики, расходы, ремонт, автомобили с заправками и техосмотром, умный дом
- 🎙️ **Голосовое управление** – «Привет, Siri, pinn»: добавить в список покупок, прочитать список, создать задачу, узнать планы на сегодня – теперь и по-русски
- 🔔 **Уведомления** – личные push-сообщения на iPhone, iPad и Android и колокольчик со всеми изменениями в семье

pinn. говорит на **🇬🇧 English, 🇩🇪 Deutsch, 🇪🇸 Español, 🇫🇷 Français, 🇮🇹 Italiano, 🇧🇷 Português, 🇨🇳 中文, 🇯🇵 日本語, 🇰🇷 한국어 и 🇷🇺 Русский**, подстраивает валюту и номера экстренных служб под ваш регион и переключается между терминами **«семья»** и **«совместная квартира»**. Один сервер может вести несколько семей, у каждой свои администраторы.

## Что нового в 1.121.0

**Русский язык открыт для всех**

- **Русский теперь доступен всем** – выберите его в разделе «Настройки → Язык и регион». Все 6 722 текста приложения, push-уведомления сервера, мастер настройки и экспорт данных – на русском.
- Регион **Россия** (рубль, экстренные номера 102/103/101/112) и русские обозначения единиц (км, л, мм, кг, кВт·ч, км/ч) в разделах «Транспорт», «Дом», «Семья», «Погода» и в уведомлениях. Аккаунт со страной «Россия» автоматически получает push-уведомления на русском.
- **Голосовое управление понимает русский** («Добавь молоко и яйца в список покупок», «Напомни завтра вынести мусор», «Что в списке покупок?», «Что запланировано на сегодня?») и отвечает по-русски.
- Мелочи: голосовое управление теперь замечает повторы в названиях на кириллице; подсказка «Также на …» под голосовым управлением называет русский.
- Изменено: `index.html`, `js/sprachen.js`, `js/region.js`, `js/fahrzeuge.js`, `js/familie.js`, `js/hinweise.js`, `js/zuhause.js`, `js/sprachsteuerung.js`, `js/versionslog.js`, `einrichtung.js`, `i18n/*.i18n.js`, `i18n/versionslog.en.js`, `pb_hooks/pinn-sprache.js`, `pb_hooks/pinn-ausblick.js`, `pb_hooks/pinn-familie-geburtstag.js`, `pb_hooks/pinn-haustiere.js`, `pb_hooks/pinn-ortung.js`, `pb_hooks/pinn-wobistdu.js`. Установка как обычно (`sudo sh pinn-*/pinn-setup.sh` или кнопка обновления). После обновления отправьте тестовое push-уведомление на русском (Настройки → Уведомления → Тест).

## Требования

- NAS или мини-ПК с **Docker** и **Docker Compose** (например, Synology, UGREEN, QNAP или обычный Linux-сервер)
- Доступ по SSH
- Для доступа снаружи – VPN (WireGuard или Tailscale) или собственный домен с HTTPS

## Установка

1. Скачайте ZIP [последнего релиза](https://github.com/pinn-shost/pinn/releases/latest) и распакуйте его.
2. Создайте на NAS папку, например `/volume1/docker/Pocketbase`, и положите в неё распакованную папку (например, `pinn-1.121.0` или `pinn-main`) как есть.
3. Подключитесь по SSH и выполните:
   ```sh
   cd /volume1/docker/Pocketbase && sudo sh pinn-*/pinn-setup.sh
   ```
4. Откройте `http://<IP-адрес NAS>:8090` → **Войти как главный администратор** → пароль `Admin` → задайте свой пароль.
5. **Мастер настройки** проведёт вас дальше – HTTPS, удалённый доступ, Google, ИИ, геопозиция и Home Assistant – шаг за шагом, на десяти языках.
6. Откройте pinn. по HTTPS-адресу на каждом телефоне и добавьте на экран «Домой»:
   - **iPhone/iPad (Safari):** «Поделиться» → *На экран «Домой»* (для уведомлений нужна iOS 16.4 или новее)
   - **Android (Chrome):** Настройки → Уведомления → *Установить pinn. как приложение* или меню Chrome ⋮ → *Установить приложение*

**Обновление:** скачайте новый ZIP, положите распакованную папку в ту же папку и снова выполните `sudo sh pinn-*/pinn-setup.sh`. Заменённые файлы остаются в `_alt/`, ваши данные не затрагиваются. **Резервные копии** создаются каждую ночь в `./backups` и хранятся 14 дней.

## Конфиденциальность

Все данные остаются на вашем NAS в одной базе PocketBase. Сервера pinn. не существует, телеметрии нет. Весь код и все библиотеки отдаёт ваш NAS. Push-уведомления не содержат содержимого: Apple, Google и Mozilla доставляют только пустой сигнал, а само сообщение устройство забирает с вашего NAS.

## Поддержать pinn.

pinn. бесплатен и открыт. Если он вам полезен, можно поддержать проект на [Ko-fi](https://ko-fi.com/pinnapp).

## Лицензия

[MIT](LICENSE)
