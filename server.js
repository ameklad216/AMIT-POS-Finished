const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('node:path');

const createRoutes = require('./routes');
const { csrfToken, csrfProtection } = require('./middleware/auth');

function createApp({
  pool,
  secret = process.env.SESSION_SECRET,
  production =
    process.env.VERCEL === '1' ||
    process.env.NODE_ENV === 'production',
  sessionSchema = 'public',
  logging = true,
} = {}) {
  /*
   * لا نستخدم fallback secret في Production لأن تغيير الـ secret
   * بين Serverless instances سيكسر الـ sessions.
   */
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET must contain at least 32 characters.'
    );
  }

  if (!pool) {
    throw new Error('A PostgreSQL pool is required.');
  }

  const app = express();

  // -----------------------------------------------------
  // Express
  // -----------------------------------------------------

  app.disable('x-powered-by');

  /*
   * Vercel يعمل خلف Reverse Proxy.
   * محلياً لن يتم تفعيله إلا لو طلبت ذلك صراحة.
   */
  if (
    process.env.VERCEL === '1' ||
    process.env.TRUST_PROXY === '1'
  ) {
    app.set('trust proxy', 1);
  }

  // -----------------------------------------------------
  // EJS
  // -----------------------------------------------------

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // -----------------------------------------------------
  // Helmet
  // -----------------------------------------------------

  const contentSecurityPolicy = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: [
      "'self'",
      'https:',
      'http:',
      'data:',
    ],
  };

  /*
   * في Production نسمح لـ Helmet بإضافة
   * upgrade-insecure-requests.
   *
   * محلياً نحذفها حتى لا يحاول المتصفح تحويل
   * localhost من HTTP إلى HTTPS.
   */
  if (!production) {
    contentSecurityPolicy.upgradeInsecureRequests = null;
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: contentSecurityPolicy,
      },
    })
  );

  // -----------------------------------------------------
  // Static files
  // -----------------------------------------------------

  app.use(
    '/assets',
    express.static(
      path.join(__dirname, 'public'),
      {
        maxAge: production ? '1d' : 0,
      }
    )
  );

  // -----------------------------------------------------
  // Logging
  // -----------------------------------------------------

  if (logging) {
    app.use(morgan('dev'));
  }

  // -----------------------------------------------------
  // Form body
  // -----------------------------------------------------

  app.use(
    express.urlencoded({
      extended: false,
      limit: '32kb',
    })
  );

  // -----------------------------------------------------
  // PostgreSQL Session Store
  // -----------------------------------------------------

  const store = new PgSession({
    pool,

    schemaName: sessionSchema,

    tableName: 'sessions',

    /*
     * دي أهم إضافة هنا.
     *
     * لو جدول sessions مش موجود في PostgreSQL
     * التطبيق مش هيفشل عند أول Session request.
     */
    createTableIfMissing: true,

    /*
     * مناسب أكثر للـ Serverless.
     * لا ننشئ Timer دائم لتنظيف الـ sessions.
     */
    pruneSessionInterval: false,
  });

  store.on('error', (error) => {
    console.error(
      '[SESSION STORE ERROR]',
      error
    );
  });

  // -----------------------------------------------------
  // Session
  // -----------------------------------------------------

  app.use(
    session({
      name: 'admin_ejs.sid',

      secret,

      store,

      resave: false,

      saveUninitialized: false,

      rolling: true,

      cookie: {
        httpOnly: true,

        sameSite: 'lax',

        /*
         * Local:
         * http://localhost → false
         *
         * Vercel:
         * https://...vercel.app → true
         */
        secure: production,

        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );

  // -----------------------------------------------------
  // Template locals
  // -----------------------------------------------------

  app.use((req, res, next) => {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private'
    );

    res.locals.user =
      req.session?.user || null;

    res.locals.currentPath = req.path;

    res.locals.flash =
      req.session?.flash || null;

    if (req.session?.flash) {
      delete req.session.flash;
    }

    try {
      res.locals.csrf = csrfToken(req);
    } catch (error) {
      return next(error);
    }

    res.locals.money = (value) => {
      const number = Number(value);

      return new Intl.NumberFormat(
        'en-US',
        {
          style: 'currency',
          currency: 'USD',
        }
      ).format(
        Number.isFinite(number)
          ? number
          : 0
      );
    };

    next();
  });

  // -----------------------------------------------------
  // CSRF
  // -----------------------------------------------------

  app.use(csrfProtection);

  // -----------------------------------------------------
  // Routes
  // -----------------------------------------------------

  app.use(createRoutes(pool));

  // -----------------------------------------------------
  // 404
  // -----------------------------------------------------

  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Page not found',
      status: 404,
      message:
        'The page you requested does not exist.',

      user:
        res.locals.user || null,

      csrf:
        res.locals.csrf || '',

      currentPath:
        req.path,

      flash: null,
    });
  });

  // -----------------------------------------------------
  // Error handler
  // -----------------------------------------------------

  app.use(
    (error, req, res, next) => {
      if (res.headersSent) {
        return next(error);
      }

      /*
       * اطبع الـ stack بالكامل على Vercel
       * بدل error.message فقط.
       *
       * دي مهمة جداً لمعرفة الخطأ الحقيقي
       * من Runtime Logs.
       */
      console.error(
        '[APPLICATION ERROR]',
        error
      );

      let status = 500;

      if (
        error.type ===
        'entity.too.large'
      ) {
        status = 413;
      } else if (
        Number.isInteger(error.status) &&
        error.status >= 400 &&
        error.status <= 599
      ) {
        status = error.status;
      }

      const message =
        status === 413
          ? 'Request body too large.'
          : 'The request could not be completed. Please try again.';

      /*
       * لو error.ejs نفسه فيه مشكلة
       * مانخليش الـ Function تقع مرة ثانية.
       */
      res.status(status);

      res.render(
        'error',
        {
          title: 'Request failed',

          status,

          message,

          user:
            res.locals.user || null,

          csrf:
            res.locals.csrf || '',

          currentPath:
            req.path,

          flash: null,
        },
        (renderError, html) => {
          if (renderError) {
            console.error(
              '[ERROR PAGE RENDER ERROR]',
              renderError
            );

            return res
              .type('html')
              .send(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="UTF-8">
                    <title>Request failed</title>
                  </head>
                  <body>
                    <h1>${status}</h1>
                    <p>${message}</p>
                  </body>
                </html>
              `);
          }

          return res.send(html);
        }
      );
    }
  );

  app.locals.sessionStore = store;

  return app;
}

module.exports = {
  createApp,
};