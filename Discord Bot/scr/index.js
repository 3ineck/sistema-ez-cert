// Import modules
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const {
  Client,
  IntentsBitField,
  GatewayIntentBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Events,
} = require("discord.js");
const eventHandler = require("./handlers/eventHandler.js");
const bodyParser = require("body-parser");
const express = require("express");

//Configuração express e body-parser
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Criar uma instância de Discord client e setar Intents
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

//Passar dados para o Handler
eventHandler(client);

// Login Bot
client.login(process.env.TOKEN);
app.listen(3000);
console.log("API Online");

//Quando ficar pronto
client.once("ready", () => {
  console.log(`Bot conectado como ${client.user.tag}`);

  const canal = client.channels.cache.get(process.env.CANAL_MENSAGEM);
  if (canal) {
    canal.send("Olá, mundo! Estou ativo");
  } else {
    console.log("Canal não encontrado.");
  }
});

///////////////////////////////////////////////
/////////////////////POST//////////////////////
///////////////////////////////////////////////

//Cortesia
const buttonAutorizar = new ButtonBuilder()
  .setCustomId("botao_autorizar")
  .setLabel("Autorizar")
  .setStyle(ButtonStyle.Success)
  .setDisabled(false);

const buttonRecusar = new ButtonBuilder()
  .setCustomId("botao_recusar")
  .setLabel("Recusar")
  .setStyle(ButtonStyle.Danger)
  .setDisabled(false);

const rowCortesia = new ActionRowBuilder().addComponents(
  buttonAutorizar,
  buttonRecusar
);

app.post("/tecd/cortesia", async (req, res) => {
  let produto = req.body.produto ? req.body.produto : "";
  let id = req.body.id ? req.body.id : "";
  let validade = req.body.validade ? req.body.validade : "";
  let parceiro = req.body.parceiro ? req.body.parceiro : "";
  let cliente = req.body.cliente ? req.body.cliente : "";
  let dataCriacao = req.body.data ? req.body.data : "";
  let justificativa = req.body.justificativa ? req.body.justificativa : "";
  let usuario = req.body.usuario ? req.body.usuario : "";

  const canal = client.channels.cache.get(process.env.CANAL_MENSAGEM);

  if (!canal) {
    console.log("Canal não encontrado.");
    return res.status(404).send({ erro: "Canal não encontrado." });
  }

  try {
    await canal.send({
      content: "Cortesia número: " + id,
      components: [rowCortesia],
      embeds: [
        {
          title: "Solicitação de Cortesia " + id,
          description: "Foi solicitado uma cortesia para um parceiro.",
          color: 3696598,
          timestamp: dataCriacao,
          author: {
            url: "",
            name: usuario,
          },
          thumbnail: {
            url: "https://images.icon-icons.com/822/PNG/512/confirm_icon-icons.com_66471.png",
          },
          footer: {
            text: usuario,
          },
          fields: [
            {
              name: "Parceiro",
              value: parceiro,
              inline: false,
            },
            {
              name: "Produto",
              value: produto + " - " + validade + " meses",
              inline: false,
            },
            {
              name: "Cliente",
              value: cliente,
              inline: false,
            },
            {
              name: "Justificativa",
              value: justificativa,
              inline: false,
            },
          ],
        },
      ],
    });

    res.send({ sucesso: true });
  } catch (erro) {
    console.error(erro);
    res.status(500).send({ erro: "Erro ao enviar mensagem." });
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  //CORTESIA AUTORIZADA
  if (interaction.customId == "botao_autorizar") {
    const confirmacao = "true";
    const id = interaction.message.content.slice(17);

    const response = await fetch("http://localhost:4000/cortesia-confirmacao", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmacao: confirmacao, id: id }),
    });
  }

  //CORTESIA RECUSADA
  if (interaction.customId == "botao_recusar") {
    const confirmacao = "false";
    const id = interaction.message.content.slice(17);

    const response = await fetch("http://localhost:4000/cortesia-confirmacao", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmacao: confirmacao, id: id }),
    });
  }
});
