var assert = require("assert");
var request = require("supertest");

var jwt = require("jsonwebtoken");

var app;

before(async function () {
    var {Client} = require("pg");
    var client = new Client("postgresql://ctf@localhost/template1");

    await client.connect();
    await client.query("DROP DATABASE IF EXISTS ctfjstesting");
    await client.query("CREATE DATABASE ctfjstesting");
    await client.end();
    const PORT = 9225;
    const DATABASE_URI = "postgresql://ctf@localhost/ctfjstesting";
    const SECRET_KEY = "secret_for_testing_only";

    var CTF = require("ctfjs");
    await require("ctfjs/db").init("postgresql://ctf@localhost/ctfjstesting");
    var ctf = new CTF({
        db_uri: "postgresql://ctf@localhost/ctfjstesting",
        jwt_secret: "secret_for_testing_only",
    });

    require("../home")(ctf);

    var express = require("express");
    app = express();
    app.use(ctf.router);
});

describe("Home", function () {
    var adminAuth;
    var userAuth;

    before(async function () {
        await request(app)
            .post("/admin")
            .set("referer", "https://angstromctf.com")
            .set("host", "angstromctf.com")
            .set("cookie", "_csrf=abc")
            .send({
                email: "  email@email.email  ",
                username: " admin   ",
                password: "admin123",
                _csrf: "abc",
            })
            .expect(201)
            .then(function () {
                return request(app)
                    .post("/admin/auth")
                    .set("referer", "https://angstromctf.com")
                    .set("host", "angstromctf.com")
                    .set("cookie", "_csrf=abc")
                    .send({
                        username: "admin",
                        password: "admin123",
                        _csrf: "abc",
                    })
                    .expect(200);
            })
            .then(function (response) {
                adminAuth = response.body.token;
            })
            .then(function () {
                return request(app)
                    .post("/competitions")
                    .set("referer", "https://angstromctf.com")
                    .set("host", "angstromctf.com")
                    .set("cookie", "_csrf=abc; token=" + adminAuth)
                    .send({
                        _csrf: "abc",
                        name: "testing",
                        about: "for testing",
                        teamSize: 3,
                        start: new Date().toISOString(),
                        end: new Date(new Date() + 500000).toISOString(),
                    })
                    .expect(201);
            })
            .then(function () {
                return request(app)
                    .post("/competitions/1/users")
                    .set("referer", "https://angstromctf.com")
                    .set("host", "angstromctf.com")
                    .set("cookie", "_csrf=abc")
                    .send({
                        _csrf: "abc",
                        username: "test",
                        email: "test@test.test",
                        password: "test1234",
                        eligible: false,
                    })
                    .expect(201);
            })
            .then(function () {
                return request(app)
                    .post("/competitions/1/auth")
                    .set("referer", "https://angstromctf.com")
                    .set("host", "angstromctf.com")
                    .set("cookie", "_csrf=abc")
                    .send({
                        _csrf: "abc",
                        username: "test",
                        password: "test1234",
                    })
                    .expect(200);
            })
            .then(function (response) {
                userAuth = response.body.token;
            });
    });

    describe("PUT /home", function () {
        it("204 | creates home page", function (done) {
            request(app)
                .put("/home")
                .set("referer", "https://angstromctf.com")
                .set("host", "angstromctf.com")
                .set("cookie", "_csrf=abc; token=" + adminAuth)
                .send({
                    _csrf: "abc",
                    title: "home title",
                    content: "home content",
                })
                .expect(204, done);
        });
        it("403 | does not allow creation if not admin", function (done) {
            request(app)
                .put("/home")
                .set("referer", "https://angstromctf.com")
                .set("host", "angstromctf.com")
                .set("cookie", "_csrf=abc; token=" + userAuth)
                .send({
                    _csrf: "abc",
                    title: "home title",
                    content: "home content",
                })
                .expect(403, done);
        });
        it("401 | does not allow creation if not authenticated", function (done) {
            request(app)
                .put("/home")
                .set("referer", "https://angstromctf.com")
                .set("host", "angstromctf.com")
                .set("cookie", "_csrf=abc")
                .send({_csrf: "abc"})
                .expect(401, done);
        });
    });
    describe("GET /home", function () {
        it("200 | gets home page", function (done) {
            request(app)
                .get("/home")
                .set("referer", "https://angstromctf.com")
                .set("host", "angstromctf.com")
                .expect(200)
                .expect({title: "home title", content: "home content"}, done);
        });
    });
});
