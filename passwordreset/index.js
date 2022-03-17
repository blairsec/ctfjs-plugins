module.exports = function (ctf) {
    // imports
    var express = require("express");
    var passport = ctf.passport;
    var nodemailer = require("nodemailer");
    var aws = require("aws-sdk");
    var crypto = require("crypto");
    var {body, validationResult} = require("express-validator/check");

    // password reset model
    class PasswordReset extends ctf.models.Model {
        static get tableName() {
            return "password_reset";
        }

        static get properties() {
            return super.properties.concat([
                {
                    name: "token",
                    valid: (title) => typeof title === "string",
                },
                {
                    name: "used",
                    valid: (used) => typeof used === "boolean",
                },
                {
                    name: "expiry",
                    valid: (expiry) => expiry instanceof Date,
                },
                {
                    name: "user",
                    valid: (user) => typeof user === "number" && user >= 0,
                },
            ]);
        }

        constructor(given) {
            super(given);
        }
    }

    // set up email
    var transporter = nodemailer.createTransport({
        SES: new aws.SES({
            apiVersion: "2010-12-01",
        }),
    });

    // set up router
    var router = express.Router();
    var {body, validationResult} = require("express-validator/check");

    // send password reset email
    router.post(
        "/auth/reset/token",
        [
            body("email")
                .isString()
                .trim()
                .matches(/^\S+@\S+\.\S+$/),
        ],
        async (req, res) => {
            // check if data was valid
            var errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({message: "invalid_values"});
            }
            await ctf.emitBefore("sendPasswordResetEmail", req);

            var c = await ctf.models.Competition.findOne({id: req.competition});
            var h = await ctf.models.Home.findOne({});
            var u = await ctf.models.User.findOne({
                email: req.body.email,
                competition: c.id,
            });
            if (!u) return res.status(404).json({message: "user_not_found"});

            var resets = await PasswordReset.find({user: u.id, used: false});
            for (var r = 0; r < resets.length; r++) {
                if (
                    new Date().getTime() -
                        new Date(resets[r].expiry).getTime() <
                    0
                )
                    return res
                        .status(409)
                        .json({message: "password_reset_already_active"});
            }

            var token = crypto.randomBytes(16).toString("hex");
            var expiry = new Date(new Date().getTime() + 15 * 60000);
            var reset = await new PasswordReset({
                token: token,
                expiry: expiry,
                user: u.id,
            });
            await reset.save();

            transporter.sendMail(
                {
                    from: process.env.EMAIL_FROM,
                    to: req.body.email,
                    subject: "Reset Password for " + h.title + " " + c.name,
                    text: `Hello ${u.username},

You recently requested to reset your password for ${h.title} ${
                        c.name
                    }. To reset your password, please visit the following link: ${
                        process.env.RESET_URL.replace(
                            /<competition>/g,
                            c.name
                        ) + token
                    }

If you did not request to reset your password, you can safely ignore this email. The link is only valid for the next 15 minutes.

- ${h.title} Team`,
                    html: `<div>Hello <code>${u.username
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")}</code>,</div>
<div><br></div>
<div>You recently requested to reset your password for ${h.title} ${
                        c.name
                    }. To reset your password, please visit the following link: <a href="${
                        process.env.RESET_URL.replace(
                            /<competition>/g,
                            c.name
                        ) + token
                    }">${
                        process.env.RESET_URL.replace(
                            /<competition>/g,
                            c.name
                        ) + token
                    }</a></div>
<div><br></div>
<div>If you did not request to reset your password, you can safely ignore this email. The link is only valid for the next 15 minutes.</div>
<div><br></div>
<div>- ${h.title} Team</div>`,
                },
                async (err, info) => {
                    await ctf.emitAfter("sendPasswordResetEmail", req);
                    if (!err) return res.sendStatus(201);
                }
            );
        }
    );

    // verify password reset token
    router.get("/auth/reset/token", async (req, res) => {
        await ctf.emitBefore("verifyPasswordResetToken", req);

        var reset = await PasswordReset.findOne({
            token: req.query.token,
            used: false,
        });
        if (!reset) return res.status(404).json({message: "token_not_found"});
        if (new Date().getTime() - new Date(reset.expiry).getTime() >= 0)
            return res.status(404).json({message: "token_not_found"});

        await ctf.emitAfter("verifyPasswordResetToken", req);
        var user = await ctf.models.User.findOneSerialized({id: reset.user});
        return res.status(200).json({user});
    });

    // reset password
    router.post(
        "/auth/reset",
        [
            body("password").isString().isLength({min: 8}),
            body("token").isString(),
        ],
        async (req, res) => {
            // check if data was valid
            var errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({message: "invalid_values"});
            }
            await ctf.emitBefore("resetPassword", req);

            var reset = await PasswordReset.findOne({
                token: req.body.token,
                used: false,
            });
            if (!reset)
                return res.status(404).json({message: "token_not_found"});
            if (new Date().getTime() - new Date(reset.expiry).getTime() >= 0)
                return res.status(404).json({message: "token_not_found"});
            reset.used = true;
            await reset.save();

            var user = await ctf.models.User.findOne({id: reset.user});
            user.password = req.body.password;
            await user.save();
            await ctf.emitAfter("resetPassword", req);
            return res.sendStatus(204);
        }
    );

    // add route to ctf
    ctf.addCompetitionRoute("", router);
};
