module.exports = {
    apps : [
        {
            name: "expressCart",
            script: "pm2 start app.js",
            watch: true,
            env: {
                "PORT": 1111,
                "NODE_ENV": "development"
            },
            env_production: {
                "PORT": 1111,
                "NODE_ENV": "production",
            }
        }
    ]
}