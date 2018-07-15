// Copyright (C) 2018 Sacra Volskaya

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

const Discord = require("discord.js");
const Config = require("./config.json");

let server = null;  // Assigned, after bot is ready and correct server ID found
let updates = 0;  // Count dispatched updates

const state = {
  members: 0,
  users: 0,
  bots: 0,
};

const channels = {
  totalCount: {
    id: Config.totalChannel.id,
    ref: null,
    state: 'members',
    name: Config.totalChannel.name
  },
  onlineCount: {
    id: Config.onlineChannel.id,
    ref: null,
    state: 'users',
    name: Config.onlineChannel.name
  },
  botCount: {
    id: Config.botChannel.id,
    ref: null,
    state: 'bots',
    name: Config.botChannel.name
  }
};

const formatMetrics = () => `Total members - ${state.members}, `
      + `Online users - ${state.users}, `
      + `Bots - ${state.bots}`;

// Count both of them, to avoid iterating too many times
const getMetrics = () => {
  if (server == null) [0, 0, 0];

  let members = server.members.size,
      users = 0,
      bots = 0;

  server.members.map(m => {
    if (m.user.bot) bots++;
    else if (m.presence.status == 'online') users++;
  });

  return [members, users, bots];
};

// Recalculate metrics
const invalidateState = () => {
  const [members, users, bots] = getMetrics();

  state.members = members;
  state.users = users;
  state.bots = bots;
};

// Iterate trough available servers and update their counters
// It also recalculates metrics within the same loop
const updateCounters = async () => {
  invalidateState();  // Update metrics, before setting channel names

  updates++;

  console.log(`[${updates}] Updating counters…`);
  console.log(formatMetrics());

  return Promise.all(
    Object.values(channels).map(async channel => {
      if (channel.ref != null) {
        await channel.ref.setName(`${channel.name} : ${state[channel.state]}`)
               .catch(err => {
                 if (err.code == 50001)
                   console.log('Bot does not have enough permissions '
                               + `to modify #${channel.ref.name}`);
               });
      } else {
        console.log(`Tried to update ${channel.name} count, `
                    + 'but the reference to the channel is missing');
      }
    }));
};

// Will print every channel and its ID within the Config.server
// Use the output to get the references for counter channels
const assignReferences = () => {
  let i = 0;

  console.log(`Connected to ${server.name}, available channels:`);

  server.channels.forEach(channel => {
    console.log(`    [${i}] ${channel.name}, id - ${channel.id}`);

    Object.keys(channels).forEach(key => {
      if (channel.id == channels[key].id) {
        console.log(`Reference found for ${channels[key].name}`);
        channels[key].ref = channel;
      }
    })
  });

  console.log('');  // New line
}

(function() {  // Encapsulate bot, just in case
  const bot = new Discord.Client();

  // Callbacks
  bot.on("ready", async () => {
    console.log(`Bot logged in as ${bot.user.username}\n`);
    try {
      server = bot.guilds.get(Config.server);
    } catch(e) {
      console.log(`Bot is not added to server ID - ${Config.server}.`);
      console.log('Exitting…');
      bot.destroy();

      return;  // Return early, so below functions don't get called
    }

    assignReferences();
    updateCounters();  // Force update, when the bot is ready
  });

  bot.on('guildMemberAdd', async () => await updateCounters());
  bot.on('guildMemberAvailable', async () => await updateCounters());
  bot.on('guildMemberRemove', async () => await updateCounters());
  bot.on('guildMemberUpdate', async () => await updateCounters());
  bot.on('presenceUpdate', async () => await updateCounters());

  // Set meters to "Off", before exiting…
  process.on('SIGINT', async () => {
    console.log('Shutting down the bot…');

    await Promise.all(Object.values(channels).map(async channel => {
      if (channel.ref != null) {
        await channel.ref.setName(`${channel.name} : Off`)
      }
    })).catch(() => {}); // Don't care

    // Exit, after above Promise is done
    process.exit();
  });

  bot.login(Config.token);  // Login
})();
