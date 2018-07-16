// Copyright (C) 2018 Sacra Volskaya

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const Discord = require("discord.js");
const Config = require("./config.json");

(function() {  // Encapsulate bot, just in case
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

  if (Config.token == "") {
    console.error("Please add a valid token to config.json");
    process.exit();
  }

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
