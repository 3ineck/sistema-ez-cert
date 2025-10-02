import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import "dotenv/config";
import nodemailer from "nodemailer";

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
  express.json({
    type: ["application/json", "text/plain"],
  })
);

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: process.env.DB_SENHA,
  port: 5432,
});

db.connect();

function logEmail() {
  const transporter = nodemailer.createTransport({
    host: "email-ssl.com.br",
    port: 465,
    secure: true, // true for port 465, false for other ports
    auth: {
      user: process.env.EMAIL_SERVIDOR,
      pass: process.env.PASMAIL,
    },
  });

  return transporter;
}

async function procurarParceiros() {
  const result = await db.query(
    "SELECT * FROM parceiro WHERE excluido = false ORDER BY apelido ASC"
  );

  return result;
}

async function emailConfirmacao(dataFormatada, dados) {
  const transporter = logEmail();

  let mensagem1 = "";
  let mensagem2 = "";
  let mensagem3 = "";
  let ticket = "";

  if (dados.foi_liberado == true) {
    mensagem1 = "APROVAÇÃO";
    mensagem2 = "APROVADO";
    mensagem3 = "aprovada";
    ticket = dados.ticket;
  } else if (dados.foi_liberado == false) {
    mensagem1 = "REPROVAÇÃO";
    mensagem2 = "REPROVADO";
    mensagem3 = "reprovada";
  }

  const verificarNomeParceiro = await db.query(
    "SELECT apelido FROM parceiro WHERE id=$1",
    [dados.parceiro]
  );

  async function main() {
    const info = await transporter.sendMail({
      from: '"Sistema EZ CERT" <admin@ezcert.com.br>',
      to: process.env.EMAIL_SERVIDOR,
      subject: "Cortesia N" + dados.id + " - " + mensagem2,
      text: "",
      html:
        "[" +
        mensagem1 +
        " DE CORTESIA]<br /><br />A cortesia de número " +
        dados.id +
        " foi " +
        mensagem3 +
        " no dia " +
        dataFormatada +
        ".<br /><br /><strong>Parceiro: </strong>" +
        verificarNomeParceiro.rows[0].apelido +
        "<br /><br /><strong>Produto: </strong>" +
        dados.modelo +
        " - " +
        dados.validade +
        " meses" +
        "<br /><br /><strong>Ticket: </strong>" +
        ticket +
        "<br /><br /><strong>Cliente: </strong>" +
        dados.cliente +
        "<br /><br /><strong>Justificativa: </strong>" +
        dados.obs,
    });

    console.log("Mensagem enviada: %s", info.messageId);
  }

  main().catch(console.error);
}

//CORTESIA PARA PARCEIRO (0)
app.get("/admin/cortesia-parceiro", async function (req, res) {
  const tickets = await db.query(
    "SELECT cortesia_parceiro.id as id, ticket, modelo, validade, data_solicitacao, data_liberacao, apelido, cliente, foi_liberado, obs FROM cortesia_parceiro JOIN parceiro ON cortesia_parceiro.parceiro = parceiro.id ORDER BY data_solicitacao DESC, foi_liberado DESC, modelo ASC"
  );

  res.render("cortesia-parceiro.ejs", {
    tickets: tickets.rows,
  });
});

//CORTESIA PARA PARCEIRO - SOLICITAÇÃO (0)
app.get("/admin/cortesia-parceiro/solicitar", async function (req, res) {
  try {
    const parceiros = await procurarParceiros();

    res.render("cortesia-parceiro-solicitar.ejs", {
      parceiros: parceiros.rows,
    });
  } catch (error) {
    console.log(error);
  }
});

app.post("/admin/cortesia-parceiro/solicitar", async function (req, res) {
  let parceiroCortesia = req.body.parceiro;
  let produtoCortesia = req.body.produto;
  let validadeCortesia = req.body.validade;
  let clienteCortesia = req.body.cliente;
  let justificativaCortesia = req.body.justificativa;
  let dataSolicitacao = new Date();
  let dataFormatada =
    (dataSolicitacao.getDate() < 10
      ? "0" + dataSolicitacao.getDate()
      : dataSolicitacao.getDate()) +
    "/" +
    (dataSolicitacao.getMonth() + 1 < 10
      ? "0" + (dataSolicitacao.getMonth() + 1)
      : dataSolicitacao.getMonth() + 1) +
    "/" +
    dataSolicitacao.getFullYear() +
    " às " +
    (dataSolicitacao.getHours() < 10
      ? "0" + dataSolicitacao.getHours()
      : dataSolicitacao.getHours()) +
    ":" +
    (dataSolicitacao.getMinutes() < 10
      ? "0" + dataSolicitacao.getMinutes()
      : dataSolicitacao.getMinutes()) +
    ":" +
    (dataSolicitacao.getSeconds() < 10
      ? "0" + dataSolicitacao.getSeconds()
      : dataSolicitacao.getSeconds());

  //VERIFICAR SE TEM ESTOQUE
  try {
    //Verifica no banco de dados se existe tickets com o modelo e a validade em estoque
    const verificarTickets = await db.query(
      "SELECT * FROM ticket WHERE foi_usado=false AND modelo=$1 AND validade=$2 ORDER BY ticket DESC",
      [produtoCortesia, validadeCortesia]
    );

    let quantidadeEmEstoque = verificarTickets.rows.length;

    if (quantidadeEmEstoque > 0) {
      let ticketCortesia = verificarTickets.rows[0].ticket;

      try {
        //Atualizaçar os tickets
        await db.query(
          "UPDATE ticket SET (data_solicitacao, parceiro, cliente, foi_usado) = ($1, $2, $3, $4) WHERE ticket = $5",
          [
            dataSolicitacao,
            parceiroCortesia,
            clienteCortesia,
            true,
            ticketCortesia,
          ]
        );

        //Adicionar no BD de cortesias
        const salvarCortesia = await db.query(
          "INSERT INTO cortesia_parceiro (ticket, modelo, validade, data_solicitacao, parceiro, cliente, obs) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
          [
            ticketCortesia,
            produtoCortesia,
            validadeCortesia,
            dataSolicitacao,
            parceiroCortesia,
            clienteCortesia,
            justificativaCortesia,
          ]
        );

        const verificarNomeParceiro = await db.query(
          "SELECT * FROM parceiro WHERE id=$1",
          [parceiroCortesia]
        );

        //Enviar notificação para o bot do discord
        const response = await fetch("http://localhost:3000/tecd/cortesia", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: salvarCortesia.rows[0].id,
            produto: produtoCortesia,
            validade: validadeCortesia,
            data: dataSolicitacao,
            parceiro: verificarNomeParceiro.rows[0].apelido,
            cliente: clienteCortesia,
            justificativa: justificativaCortesia,
          }),
        });

        //Enviar notificação via e-mail

        const transporter = logEmail();

        async function main() {
          const info = await transporter.sendMail({
            from: '"Sistema EZ CERT" <admin@ezcert.com.br>',
            to: process.env.EMAIL_SERVIDOR,
            subject: "Solicitação de Cortesia N" + salvarCortesia.rows[0].id,
            text: "",
            html:
              "[SOLICITAÇÃO DE CORTESIA]<br /><br />A cortesia de número " +
              salvarCortesia.rows[0].id +
              " foi solicitada no dia " +
              dataFormatada +
              ".<br />Em breve a cortesia será analisada e você será notificado(a)." +
              "<br /><br /><strong>Parceiro: </strong>" +
              verificarNomeParceiro.rows[0].apelido +
              "<br /><br /><strong>Produto: </strong>" +
              salvarCortesia.rows[0].modelo +
              " - " +
              salvarCortesia.rows[0].validade +
              " meses" +
              "<br /><br /><strong>Cliente: </strong>" +
              salvarCortesia.rows[0].cliente +
              "<br /><br /><strong>Justificativa: </strong>" +
              salvarCortesia.rows[0].obs,
          });

          console.log("Mensagem enviada: %s", info.messageId);
        }

        main().catch(console.error);

        res.redirect("/admin/cortesia-parceiro");
      } catch (error) {
        console.log(error);
      }
    }
  } catch (error) {
    console.log(error);
  }
});

app.post("/cortesia-confirmacao", async function (req, res) {
  let dataLiberacao = new Date();
  let dataFormatada =
    (dataLiberacao.getDate() < 10
      ? "0" + dataLiberacao.getDate()
      : dataLiberacao.getDate()) +
    "/" +
    (dataLiberacao.getMonth() + 1 < 10
      ? "0" + (dataLiberacao.getMonth() + 1)
      : dataLiberacao.getMonth() + 1) +
    "/" +
    dataLiberacao.getFullYear() +
    " às " +
    (dataLiberacao.getHours() < 10
      ? "0" + dataLiberacao.getHours()
      : dataLiberacao.getHours()) +
    ":" +
    (dataLiberacao.getMinutes() < 10
      ? "0" + dataLiberacao.getMinutes()
      : dataLiberacao.getMinutes()) +
    ":" +
    (dataLiberacao.getSeconds() < 10
      ? "0" + dataLiberacao.getSeconds()
      : dataLiberacao.getSeconds());

  // CONFIRMAÇÃO APROVADA VIA DISCORD
  if (req.body.confirmacao == "true") {
    try {
      //ATUALIZA BD
      let cortesia = await db.query(
        "UPDATE cortesia_parceiro SET (foi_liberado, data_liberacao) = (true, $1) WHERE id = $2 RETURNING *",
        [dataLiberacao, req.body.id]
      );

      let dados = cortesia.rows[0];

      //ENVIAR E-MAIL
      emailConfirmacao(dataFormatada, dados);

      res.send({ sucesso: true });
    } catch (error) {
      console.log(error);
    }
    // CONFIRMAÇÃO REPROVAÇÃO VIA DISCORD
  } else if (req.body.confirmacao == "false") {
    try {
      //ATUALIZA BD
      let cortesia = await db.query(
        "UPDATE cortesia_parceiro SET (foi_liberado, data_liberacao) = (false, $1) WHERE id = $2 RETURNING *",
        [dataLiberacao, req.body.id]
      );

      let dados = cortesia.rows[0];

      //ENVIAR E-MAIL
      emailConfirmacao(dataFormatada, dados);

      res.send({ sucesso: true });
    } catch (error) {
      console.log(error);
    }
    // CONFIRMAÇÃO APROVAÇÃO VIA SITE
  } else if (req.body.aprovar) {
    try {
      //ATUALIZA BD
      let cortesia = await db.query(
        "UPDATE cortesia_parceiro SET (foi_liberado, data_liberacao) = (true, $1) WHERE id = $2 RETURNING *",
        [dataLiberacao, req.body.aprovar]
      );

      let dados = cortesia.rows[0];

      //ENVIAR E-MAIL
      emailConfirmacao(dataFormatada, dados);

      res.redirect("/admin/cortesia-parceiro");
    } catch (error) {
      console.log(error);
    }
    // CONFIRMAÇÃO REPROVAÇÃO VIA SITE
  } else if (req.body.reprovar) {
    try {
      //ATUALIZA BD
      let cortesia = await db.query(
        "UPDATE cortesia_parceiro SET (foi_liberado, data_liberacao) = (false, $1) WHERE id = $2 RETURNING *",
        [dataLiberacao, req.body.reprovar]
      );

      let dados = cortesia.rows[0];

      //ENVIAR E-MAIL
      emailConfirmacao(dataFormatada, dados);

      res.redirect("/admin/cortesia-parceiro");
    } catch (error) {
      console.log(error);
    }
  }
});

//Conexão com o servidor
let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}

//Retorno da conexão
app.listen(port, function () {
  console.log("Servidor conectado na porta " + port);
});
