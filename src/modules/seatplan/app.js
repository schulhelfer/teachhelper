        (function () {
          const appShellTemplate = document.getElementById('app-shell');
          const instantiateApp = () => {
            if (!appShellTemplate) {
              return null;
            }
            const fragment = appShellTemplate.content.cloneNode(true);
            appShellTemplate.replaceWith(fragment);
            return document.getElementById('app');
          };
          const appEl = instantiateApp();
          if (!appEl) {
            return;
          }
          appEl.hidden = false;
          const els = {
            file: document.getElementById('csv'),
            appVersion: document.getElementById('app-version'),
            random: document.getElementById('random'),
            suggest: document.getElementById('suggest'),
            resetLearners: document.getElementById('reset-learners'),
            resetRaster: document.getElementById('reset-raster'),
            flipPerspective: document.getElementById('toggle-perspective'),
            adjustGrid: document.getElementById('adjust-grid'),
            gridDialog: document.getElementById('grid-dialog'),
            gridDialogForm: document.getElementById('grid-dialog-form'),
            gridDialogRows: document.getElementById('grid-dialog-rows'),
            gridDialogCols: document.getElementById('grid-dialog-cols'),
            gridDialogCancel: document.getElementById('grid-dialog-cancel'),
            gridDialogMinimum: document.getElementById('grid-dialog-minimum'),
            exportPlan: document.getElementById('export-plan'),
            importPlan: document.getElementById('import-plan'),
            importPlanFile: document.getElementById('import-plan-file'),
            unseated: document.getElementById('unseated'),
            scrollHint: document.getElementById('scroll-hint'),
            grid: document.getElementById('grid'),
            gridWrap: document.querySelector('.grid-wrap'),
            teacherCard: document.getElementById('teacher-card'),
            sidePanel: document.querySelector('.side'),
            sidebarScore: document.getElementById('sidebar-score'),
            printPlanTitle: document.getElementById('print-plan-title'),
            patternPi: document.getElementById('pattern-pi'),
            patternE: document.getElementById('pattern-e'),
            patternBars3: document.getElementById('pattern-bars-3'),
            patternBars4: document.getElementById('pattern-bars-4'),
            patternBars3Gang: document.getElementById('pattern-bars-3-gang'),
            patternBars4Gang: document.getElementById('pattern-bars-4-gang'),
            csvDropZone: document.getElementById('csv-drop-zone'),
            csvStatus: document.getElementById('csv-status'),
            seatPreferences: document.getElementById('seat-preferences'),
            printPlan: document.getElementById('print-plan'),
            suggestProgress: document.getElementById('suggest-progress'),
            suggestProgressFill: document.getElementById('suggest-progress-fill'),
            suggestProgressLabel: document.getElementById('suggest-progress-label'),
            preferencesDialog: document.getElementById('preferences-dialog'),
            preferencesForm: document.getElementById('preferences-form'),
            preferencesTableBody: document.getElementById('preferences-tbody'),
            preferencesGuessGender: document.getElementById('preferences-guess-gender'),
            preferencesResetGender: document.getElementById('preferences-reset-gender'),
            preferencesGuessHint: document.getElementById('preferences-guess-hint'),
            preferencesCancel: document.getElementById('preferences-cancel'),
            criteriaDialog: document.getElementById('criteria-dialog'),
            criteriaDialogClose: document.getElementById('criteria-dialog-close'),
            criteriaStudent: document.getElementById('criteria-student'),
            criteriaList: document.getElementById('criteria-list'),
            summaryDialog: document.getElementById('summary-dialog'),
            toggleSeatScores: document.getElementById('toggle-seat-scores'),
            summaryDialogClose: document.getElementById('summary-dialog-close'),
            summaryTableHead: document.getElementById('summary-table-head'),
            summaryTableBody: document.getElementById('summary-table-body'),
            summaryEmpty: document.getElementById('summary-empty'),
            templateLink: document.getElementById('template-link'),
          };
          if (els.gridDialog && !els.gridDialog.hasAttribute('tabindex')) {
            els.gridDialog.setAttribute('tabindex', '-1');
          }
          if (els.preferencesDialog && !els.preferencesDialog.hasAttribute('tabindex')) {
            els.preferencesDialog.setAttribute('tabindex', '-1');
          }
          if (els.criteriaDialog && !els.criteriaDialog.hasAttribute('tabindex')) {
            els.criteriaDialog.setAttribute('tabindex', '-1');
          }
          if (els.summaryDialog && !els.summaryDialog.hasAttribute('tabindex')) {
            els.summaryDialog.setAttribute('tabindex', '-1');
          }
          if (els.sidebarScore) {
            els.sidebarScore.setAttribute('role', 'button');
            if (!els.sidebarScore.hasAttribute('tabindex')) {
              els.sidebarScore.setAttribute('tabindex', '0');
            }
            els.sidebarScore.addEventListener('click', () => openSummaryDialog());
            els.sidebarScore.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openSummaryDialog();
              }
            });
          }
          const TEMPLATE_CSV_NAME = 'Namensliste Vorlage.csv';
          const TEMPLATE_CSV_CONTENT = [';Nachname;Vorname', ';Wurst;Hans'].join('\n');
          const MALE_GIVEN_NAMES = [
            'aaron', 'abdullah', 'abraham', 'achim', 'adalbert', 'adalberto', 'adam', 'adamo', 'addison', 'adem', 'adiljan', 'adolf', 'adrian', 'adrianus', 'ahmad', 'ahmet',
            'aiden', 'aidin', 'aiko', 'aiman', 'airon', 'ajdin', 'akim', 'akon', 'alain', 'alan', 'albrecht', 'aldo', 'aleks', 'aleksandar', 'aleksei', 'alessandrino',
            'alexander', 'alexej', 'alfons', 'alfredo', 'ali', 'alihan', 'aljoscha', 'allan', 'aloysius', 'alper', 'alperen', 'alwin', 'amadeus', 'amar', 'ambrosius',
            'aminullah', 'amir', 'amirhan', 'anas', 'anastas', 'anatol', 'andreas', 'anil', 'ankur', 'anselm', 'anthony', 'antoine', 'anton', 'antonin', 'antonio',
            'antonios', 'antonius', 'anuar', 'arash', 'arcadius', 'archibald', 'arda', 'ares', 'arif', 'aristide', 'aristoteles', 'arjen', 'arkin', 'armand', 'armando',
            'arne', 'arnold', 'arsen', 'arslan', 'artem', 'artemis', 'arturo', 'asaf', 'aslan', 'atalay', 'athanasios', 'atik', 'atlas', 'aubin', 'august', 'augustin',
            'aurel', 'aurelio', 'aurelius', 'austin', 'ayaz', 'aydin', 'ayhan', 'aykut', 'ayman', 'azad', 'aziz', 'baltasar', 'baran', 'barnabas', 'barry', 'bart',
            'bartholomaeus', 'batu', 'belaid', 'belmin', 'ben', 'benedikt', 'benicio', 'benjamin', 'bennet', 'bennett', 'benni', 'benno', 'benny', 'bent', 'berat', 'bernard',
            'bernd', 'bernhard', 'bertram', 'bilal', 'bjarne', 'bjorn', 'bladimir', 'bodo', 'bogdan', 'bohdan', 'boris', 'borys', 'brad', 'brandon', 'brayan', 'brendan',
            'brent', 'brian', 'brice', 'broderick', 'brook', 'bruno', 'burak', 'burhan', 'caglar', 'calvin', 'cameron', 'can', 'carlo', 'carlson', 'carmelo', 'casimir',
            'caspar', 'cassian', 'cassius', 'celal', 'celestin', 'celio', 'cem', 'cesar', 'cesare', 'chadi', 'charles', 'chris', 'christian', 'christos', 'cillian', 'claas',
            'claude', 'claudio', 'clement', 'cliff', 'clifford', 'colin', 'conner', 'conradin', 'constantin', 'corbin', 'cornelius', 'cyrill', 'cyrus', 'dag', 'dalen',
            'damian', 'damiano', 'daniel', 'danyal', 'danylo', 'dario', 'dariusz', 'darwin', 'david', 'dawid', 'dean', 'demian', 'demianus', 'demir', 'dennis', 'denzel',
            'dervis', 'detlef', 'devin', 'diego', 'dieter', 'dieter-werner', 'dimitri', 'dimitrios', 'dino', 'dirk', 'diyar', 'dmytro', 'dominik', 'dominique', 'don',
            'donald', 'dorian', 'douglas', 'dragomir', 'dragos', 'drew', 'duarte', 'duke', 'dusan', 'dyllan', 'eberhard', 'eberhard-joachim', 'eddy', 'eden', 'edgar',
            'edison', 'edmond', 'edmund', 'eduard', 'edvin', 'efrain', 'ege', 'ehsan', 'eike', 'einar', 'ekrem', 'elam', 'elchanan', 'eli', 'elian', 'eliano', 'elias',
            'eliasz', 'eligius', 'elim', 'elio', 'eliseo', 'elisha', 'eliud', 'elvis', 'elyas', 'emad', 'emeka', 'emil', 'emilian', 'emiliano', 'emilio', 'emir', 'emircan',
            'emirhan', 'emrah', 'emrecan', 'ender', 'engin', 'enno', 'enrico', 'enver', 'ephraim', 'eray', 'ercan', 'erdem', 'erdogan', 'eren', 'erhan', 'eric', 'erich',
            'erik', 'erkan', 'erkut', 'ermal', 'ernest', 'ernesto', 'ernst', 'ersin', 'ertan', 'ervin', 'esat', 'esteban', 'etienne', 'eugen', 'eugene', 'eustachius', 'evan',
            'evren', 'ewald', 'eymen', 'eyup', 'ezra', 'fabian', 'fabio', 'fabrice', 'fabrizio', 'fadi', 'faik', 'falk', 'farid', 'faris', 'fathi', 'fausto', 'fedor',
            'feisal', 'felix', 'ferdinand', 'ferhat', 'ferit', 'ferman', 'fermin', 'fernando', 'feroz', 'ferris', 'fery', 'fiete', 'finley', 'finn', 'finnian', 'finnley',
            'firas', 'firat', 'flavio', 'florian', 'florin', 'floris', 'fouad', 'francesco', 'franco', 'franklin', 'franz', 'fred', 'frederik', 'fredo', 'freidrich',
            'friedrich', 'fritz', 'fulvio', 'furkan', 'fyn', 'fynn', 'gael', 'galo', 'gareth', 'gaspar', 'gaston', 'gennaro', 'geoff', 'geoffrey', 'georg', 'georgios',
            'gerd', 'gerhard', 'gero', 'gian', 'gianni', 'gil', 'gino', 'gioele', 'giorgio', 'giovanni', 'gislain', 'giuliano', 'giuseppe', 'goran', 'gordon', 'gottfried',
            'gregor', 'gregorio', 'guenter', 'guenther', 'guy', 'habib', 'hadi', 'hadrian', 'hagen', 'haidar', 'haitham', 'hakan', 'halil', 'halit', 'hamid', 'hamza',
            'hannes', 'hanno', 'hans-joachim', 'harald', 'harris', 'harry', 'hartmut', 'hasan', 'hashem', 'hashim', 'hashir', 'hassan', 'haydar', 'heiko', 'heinrich',
            'heinz', 'helge', 'helmut', 'henning', 'henry', 'herbert', 'hermann', 'hilmar', 'hinrich', 'hisham', 'hjalmar', 'hollis', 'horst', 'horst-dieter', 'hugo',
            'huseyin', 'ian', 'ibrahim', 'idris', 'ignacio', 'ignaz', 'ihsan', 'ilya', 'ilyas', 'immanuel', 'indalecio', 'ingmar', 'inigo', 'ioannis', 'irakli', 'irvin',
            'isa', 'isaac', 'isaak', 'isaias', 'isidor', 'israel', 'issam', 'ivica', 'ivo', 'iyar', 'jack', 'jackson', 'jacob', 'jacques', 'jafar', 'jaime', 'jair', 'jake',
            'jakob', 'jalil', 'jamal', 'james', 'jamie', 'jamil', 'jan', 'janek', 'janko', 'jannes', 'jannik', 'jared', 'jarik', 'jarno', 'jaron', 'jaroslav', 'jascha',
            'jason', 'jasper', 'javier', 'jay', 'jayce', 'jayden', 'jaydon', 'jean', 'jeff', 'jeffrey', 'jem', 'jenno', 'jens', 'jeremias', 'jerome', 'jerry', 'jesper',
            'jibril', 'jim', 'jimmy', 'joachim', 'joao', 'job', 'jochem', 'jody', 'joe', 'joel', 'joerg', 'joey', 'johann', 'johannes', 'johny', 'jon', 'jona', 'jonah',
            'jonas', 'jonathan', 'jonny', 'joran', 'jorge', 'joris', 'joscha', 'jose', 'josef', 'joseph', 'josh', 'joshua', 'josiah', 'jovan', 'juan', 'jubin', 'juergen',
            'jules', 'julian', 'julio', 'julius', 'jupp', 'justin', 'justus', 'kadir', 'kain', 'kaleb', 'kalil', 'kalle', 'kamil', 'karim', 'karl', 'karl-otto', 'karlheinz',
            'karlo', 'kasimir', 'kaspar', 'kassim', 'kazim', 'keano', 'keanu', 'keith', 'kellan', 'kelvin', 'ken', 'kenan', 'kenneth', 'kenny', 'kerem', 'kerim', 'kerimcan',
            'kevin', 'khaled', 'khalil', 'kian', 'kiano', 'kieran', 'kiril', 'klaus', 'klaus-dieter', 'klemens', 'kofi', 'konrad', 'koray', 'korbinian', 'kosta', 'kris',
            'krishna', 'kristian', 'kristof', 'kurt', 'kyan', 'kylo', 'kyrylo', 'laban', 'lambert', 'lamin', 'lars', 'larsen', 'lasse', 'laurentius', 'laurenz', 'lazar',
            'lazaro', 'leander', 'leandro', 'leano', 'leart', 'leif', 'leith', 'leland', 'lemmy', 'len', 'lenn', 'lennard', 'lennart', 'lenni', 'lennox', 'lenny', 'leo',
            'leoas', 'leon', 'leonard', 'leonardo', 'leonel', 'leopold', 'leroy', 'lev', 'levent', 'levi', 'levin', 'lewin', 'lewis', 'liam', 'lian', 'liban', 'linus', 'lio',
            'lion', 'lionel', 'livio', 'lloyd', 'loic', 'lorcan', 'lorenzo', 'loris', 'lothar', 'louis', 'luc', 'luca', 'luca-noel', 'lucas', 'lucian', 'luciano', 'lucien',
            'ludger', 'ludwig', 'luigi', 'luis', 'luk', 'luka', 'lukas', 'lukasz', 'luke', 'lupo', 'lyam', 'maarten', 'maceo', 'madsen', 'mahmood', 'mahmoud', 'maik',
            'mailo', 'majeed', 'makin', 'maksym', 'malcolm', 'malek', 'maleo', 'malik', 'malte', 'manfred', 'manfred-otto', 'manolo', 'mansour', 'manuel', 'marc', 'marcello',
            'marco', 'marcos', 'marek', 'marius', 'mariusz', 'mark', 'marko', 'marlo', 'marlon', 'marten', 'martin', 'martino', 'marvin', 'marwan', 'masoud', 'matej',
            'mateo', 'matheo', 'mathias', 'mats', 'matteo', 'matthias', 'matthis', 'matti', 'maurice', 'max', 'maximilian', 'maximus', 'mayron', 'mehdi', 'mehmet', 'meir',
            'melih', 'mendel', 'meric', 'mert', 'mertcan', 'mesut', 'metin', 'meysam', 'michail', 'mick', 'miguel', 'mihai', 'mihail', 'mika', 'mikael', 'mike', 'mikkel',
            'milad', 'milan', 'milos', 'milosz', 'minh', 'mio', 'miran', 'mirza', 'mohammad', 'mohammed', 'mohsen', 'monty', 'mordechai', 'morgan', 'moritz', 'morris',
            'moustafa', 'muhammed', 'munir', 'murad', 'musa', 'musaab', 'musab', 'mustafa', 'mustapha', 'mutlu', 'mykhailo', 'nabil', 'nadir', 'naim', 'naimullah', 'najib',
            'nathan', 'nathanael', 'nathaniel', 'nazim', 'ndre', 'nebil', 'neil', 'nelson', 'neo', 'neoel', 'neven', 'nevio', 'nicanor', 'nick', 'nicklas', 'nico', 'niklas',
            'niko', 'nikodem', 'nikola', 'nikolai', 'nikos', 'nil', 'nils', 'nima', 'nino', 'nizar', 'noah', 'noam', 'nobel', 'noel', 'norbert', 'nuh', 'numan', 'obrad',
            'octavian', 'odysseus', 'oguz', 'okan', 'olaf', 'ole', 'oleg', 'oleksandr', 'oleksii', 'oliver', 'olivier', 'omar', 'omer', 'omerfaruk', 'onur', 'orhan',
            'orlando', 'orlin', 'orun', 'oskar', 'osman', 'otmar', 'otto', 'otwin', 'ozan', 'ozgur', 'ozkan', 'pablo', 'pascal', 'patrick', 'paul', 'pavel', 'pedro', 'peer',
            'pepe', 'per', 'percy', 'perikles', 'petar', 'peter', 'petros', 'petrus', 'philemon', 'philip', 'philipp', 'pierce', 'piero', 'pierre', 'piet', 'pietro', 'pim',
            'piran', 'poldi', 'priam', 'prince', 'przemek', 'qasim', 'qays', 'quinten', 'quintus', 'rafael', 'ragip', 'rahim', 'rahman', 'raimund', 'rainer', 'ramazan',
            'ramiro', 'ramon', 'raoul', 'rasmus', 'raul', 'ray', 'raymond', 'recep', 'redi', 'redwan', 'rehan', 'reidar', 'reinhard', 'reinhold', 'reino', 'rene', 'reza',
            'richard', 'rida', 'ridvan', 'riku', 'rinaldo', 'ritchie', 'robin', 'rocco', 'rodrigo', 'roland', 'rolf', 'romanus', 'romario', 'rome', 'ron', 'ronald', 'ronny',
            'rosario', 'rouven', 'ruben', 'rubin', 'rudi', 'rudiger', 'rudolf', 'ruediger', 'rufus', 'rune', 'rupert', 'ruslan', 'rustam', 'ryan', 'saban', 'sabri', 'sacha',
            'sadi', 'sadik', 'safak', 'salah', 'salih', 'salim', 'salman', 'salvatore', 'sam', 'samed', 'samer', 'samet', 'samir', 'samuel', 'sandro', 'santo', 'sargon',
            'sasa', 'sasha', 'saul', 'sean', 'sebastian', 'selcuk', 'selim', 'selman', 'serdar', 'serge', 'sergio', 'serkan', 'seth', 'seyed', 'shahin', 'shawn', 'shervin',
            'shlomo', 'sid', 'siegfried', 'silas', 'silvan', 'silvano', 'simon', 'sinan', 'sinisa', 'sirin', 'siyar', 'skander', 'slavko', 'soeren', 'soheil', 'sokrates',
            'solomon', 'sonny', 'soren', 'stan', 'stanislav', 'stanko', 'stephan', 'steve', 'stoyan', 'suleiman', 'suleyman', 'sven', 'svend', 'tadeo', 'tadeus', 'taha',
            'tahir', 'tamas', 'tamer', 'tamino', 'tammo', 'tarik', 'tariq', 'tassilo', 'tayyip', 'teo', 'teoman', 'terence', 'terry', 'thabo', 'theo', 'theodor', 'thiago',
            'thies', 'thilo', 'thor', 'thore', 'tian', 'tibor', 'tigran', 'till', 'tilman', 'tilmann', 'tilo', 'tim', 'timo', 'timon', 'timothy', 'titus', 'tjarco', 'tjerk',
            'tobias', 'tobit', 'todor', 'togan', 'tolga', 'tom', 'tomas', 'tomer', 'tomke', 'toni', 'tor', 'tore', 'torsten', 'tristan', 'turanhan', 'tyler', 'tyron',
            'tyrone', 'udo', 'ugur', 'ulises', 'ulrich', 'umar', 'umit', 'umut', 'urban', 'uriel', 'utku', 'vahit', 'valentin', 'vasil', 'vassili', 'vedat', 'veikko', 'veit',
            'veli', 'verner', 'veselin', 'vincent', 'vincenzo', 'vithuran', 'vladimir', 'volkan', 'wade', 'walid', 'walter', 'waris', 'werner', 'wesley', 'wilfried',
            'wilhelm', 'wilson', 'winston', 'wolf', 'wolfgang', 'wolfram', 'xaver', 'xavier', 'xeno', 'yahia', 'yaman', 'yannis', 'yaroslav', 'yaser', 'yasin', 'yassin',
            'yavuz', 'yehor', 'yevhen', 'yigit', 'yonas', 'yorick', 'younan', 'yuri', 'yusuf', 'yves', 'zacharias', 'zack', 'zafer', 'zaki', 'zaman', 'zebulon', 'zeki',
            'zeljko', 'zeno', 'zlatan', 'zsolt'
          ];
          const FEMALE_GIVEN_NAMES = [
            'aaliyah', 'ada', 'adaline', 'adela', 'adele', 'adina', 'adriana', 'agatha', 'agnes', 'agnessa', 'aida', 'aileen', 'ailin', 'ailyn', 'aime', 'aimee', 'aimy',
            'aina', 'aisha', 'aishah', 'aivie', 'ajla', 'akila', 'alba', 'aleena', 'alena', 'alessa', 'alessia', 'alexandra', 'alexia', 'alicia', 'alida', 'alina', 'aline',
            'alisa', 'aliya', 'aliyah', 'aliza', 'alma', 'almina', 'almut', 'alva', 'amalia', 'amalie', 'amanda', 'amara', 'amari', 'amaya', 'amelia', 'amelie', 'amina',
            'aminah', 'amira', 'amrei', 'amy', 'ana', 'anabel', 'anait', 'anastasia', 'anastasiya', 'anca', 'anda', 'andrea', 'anelia', 'anesa', 'anessa', 'anett', 'anette',
            'anika', 'anissa', 'anita', 'anja', 'anka', 'ann', 'anna', 'annabell', 'annabella', 'annabelle', 'anne', 'annegret', 'annelie', 'annelies', 'anneliese',
            'annelore', 'annemarie', 'annette', 'anni', 'annika', 'annina', 'anouk', 'anthea', 'antonia', 'antonina', 'anya', 'ariadne', 'ariana', 'ariella', 'arwen', 'arzu',
            'asena', 'asia', 'astrid', 'asya', 'athina', 'aubrey', 'augusta', 'aurelia', 'aurora', 'ava', 'aya', 'ayda', 'ayla', 'ayleen', 'aylin', 'aysel', 'aysha', 'azra',
            'bahar', 'barbara', 'basma', 'bea', 'beata', 'beate', 'beatrice', 'beatrix', 'belen', 'bente', 'beren', 'berfin', 'beril', 'berna', 'bernadette', 'beyza',
            'bianca', 'bilge', 'birgit', 'birgitta', 'bistra', 'blanca', 'blanka', 'blume', 'bojana', 'bonnie', 'brenda', 'brianna', 'brigitte', 'brunhilde', 'carina',
            'carla', 'carlotta', 'carmen', 'caro', 'carolin', 'carolina', 'caroline', 'cassandra', 'catalina', 'celeste', 'celina', 'cennet', 'charis', 'charlene',
            'charlotte', 'chelsea', 'chiara', 'chloe', 'christa', 'christel', 'christina', 'christine', 'cindy', 'clara', 'clarissa', 'claudia', 'cleo', 'colette',
            'constanze', 'corinna', 'cornelia', 'cynthia', 'dagmar', 'dalia', 'dalila', 'dana', 'daniela', 'danielle', 'daria', 'dariah', 'darlene', 'darya', 'defne',
            'delia', 'dena', 'denise', 'desiree', 'diana', 'dilan', 'dilara', 'dina', 'dlimas', 'dora', 'dorina', 'dorothea', 'dorothee', 'dunya', 'ebba', 'ecrin', 'eda', 'eddie',
            'edel', 'edina', 'editha', 'edna', 'efsun', 'eileen', 'ela', 'elaine', 'elana', 'elara', 'elda', 'elea', 'elena', 'eleonora', 'eleonore', 'elfriede', 'elif', 'elina',
            'elinor', 'elisa', 'elisabeth', 'elise', 'eliska', 'eliza', 'ella', 'elle', 'ellen', 'elli', 'ellie', 'elmira', 'eloise', 'elona', 'elsa', 'else', 'elsie',
            'elva', 'elvira', 'elysa', 'emelie', 'emely', 'emi', 'emilia', 'emilie', 'emily', 'emma', 'emma-marie', 'emma-sophie', 'emmi', 'emmie', 'emmy', 'enda', 'enissa',
            'enna', 'enola', 'enya', 'erika', 'erin', 'esila', 'eslem', 'esma', 'esmeralda', 'esra', 'estelle', 'esther', 'eva', 'evangeline', 'evdokia', 'evelin', 'evelina',
            'eveline', 'evelyn', 'evi', 'evita', 'fabienne', 'fadime', 'fanny', 'farah', 'farina', 'fatima', 'fatma', 'felicia', 'felicitas', 'felina', 'fenja', 'feride',
            'fernanda', 'feyza', 'fidan', 'filiz', 'fina', 'finja', 'finnja', 'fiona', 'florence', 'florentina', 'florentine', 'florine', 'franca', 'frances', 'francesca',
            'franzi', 'franziska', 'freya', 'frida', 'frieda', 'fritzi', 'gabi', 'gabriela', 'gabriella', 'gaia', 'gala', 'ganna', 'gaya', 'georgia', 'georgina', 'gerda',
            'gertrud', 'gilda', 'ginevra', 'gisela', 'giulia', 'giuliana', 'gizem', 'gloria', 'gordana', 'grace', 'greta', 'grete', 'gretel', 'gudrun', 'gül', 'gülay', 'gülcan',
            'gülsen', 'hadiya', 'hafsa', 'hajar', 'hale', 'halime', 'halina', 'hana', 'hande', 'hanna', 'hannah', 'hanne', 'hannelore', 'harmony', 'hatice', 'havva', 'hazal',
            'hedda', 'heidi', 'heike', 'helena', 'helene', 'helga', 'henriette', 'hera', 'hermine', 'hiba', 'hilda', 'hildegard', 'hilke', 'hilma', 'hira', 'hivda', 'honey',
            'ida', 'ilayda', 'ilayla', 'ilina', 'ilona', 'ilse', 'imke', 'ina', 'inaya', 'indira', 'ines', 'inessa', 'inga', 'inge', 'ingeborg', 'ingrid', 'iole', 'iona',
            'irene', 'irina', 'iris', 'irma', 'irmgard', 'iryna', 'isabel', 'isabell', 'isabella', 'isabelle', 'isadora', 'isela', 'isla', 'ismene', 'isolde', 'ivana',
            'ivanka', 'ivy', 'jainee', 'jana', 'janet', 'janette', 'janina', 'janna', 'janne', 'jara', 'jarmila', 'jasmin', 'jasmine', 'jella', 'jemima', 'jenna', 'jennifer',
            'jenny', 'jessica', 'jette', 'jil', 'jill', 'joana', 'joanna', 'johanna', 'jola', 'jolina', 'josefa', 'josefine', 'josephine', 'joy', 'juana', 'judith', 'jule',
            'julia', 'juliana', 'juliane', 'julie', 'julienne', 'julietta', 'julika', 'julina', 'juna', 'juno', 'jusra', 'justina', 'justine', 'kaja', 'kalina', 'kamila',
            'karima', 'karin', 'karina', 'karla', 'karolina', 'karoline', 'kassandra', 'katarina', 'kateryna', 'katharina', 'kathrin', 'katja', 'katleen', 'katya', 'keira',
            'kendra', 'kenia', 'kerstin', 'kiana', 'kiara', 'kira', 'kirsten', 'kitti', 'klara', 'kornelia', 'kristin', 'kristina', 'lana', 'lara', 'lara-sophie', 'larissa',
            'laura', 'laureen', 'lauretta', 'laurine', 'lavinia', 'lea', 'lea-marie', 'lea-sophie', 'leah', 'leandra', 'leanne', 'leila', 'leilani', 'leina', 'lelia', 'lena',
            'lena-marie', 'lena-sophie', 'leni', 'lenia', 'lenja', 'lenka', 'leona', 'leonie', 'leora', 'lerina', 'leticia', 'letizia', 'levke', 'leyla', 'lia', 'liana',
            'liane', 'lianne', 'lidia', 'lidiya', 'lila', 'lili', 'lilia', 'lilian', 'liliana', 'lilith', 'lilja', 'lilli', 'lillian', 'lilly', 'lilly-marie', 'lina',
            'lina-marie', 'lina-sophie', 'linda', 'line', 'linette', 'linh', 'linn', 'linnea', 'lisa', 'lisanne', 'liv', 'liva', 'livia', 'lola', 'lona', 'lore', 'lorelei',
            'lorena', 'loretta', 'lori', 'lorraine', 'lotta', 'lotte', 'lotti', 'louisa', 'louise', 'louna', 'luana', 'lucia', 'luisa', 'luise', 'luna', 'luz', 'lya', 'lydia',
            'lyla', 'lynn', 'madita', 'madlen', 'madlena', 'mady', 'maelle', 'magdalena', 'magdalene', 'maia', 'maike', 'maila', 'maja', 'malak', 'malea', 'malia', 'malina',
            'malou', 'mara', 'maral', 'marcela', 'marceline', 'marcia', 'mareike', 'maren', 'marga', 'margarete', 'margarita', 'margit', 'margot', 'maria', 'mariah',
            'mariam', 'marianne', 'marie', 'mariella', 'marielle', 'marietta', 'marika', 'marina', 'marion', 'marisa', 'marisol', 'marit', 'marla', 'marleen', 'marlen',
            'marlene', 'marlie', 'marlies', 'marta', 'martha', 'marthe', 'martina', 'mary', 'masha', 'mathilda', 'mathilde', 'matilda', 'maura', 'maya', 'mayra', 'medina', 'melanie', 'melike',
            'melina', 'melinda', 'meline', 'melis', 'melisa', 'melissa', 'meltem', 'mena', 'meral', 'meri', 'merle', 'meryem', 'mia', 'mia-marie', 'mia-sophie', 'michaela',
            'michelle', 'mila', 'milena', 'mileva', 'milica', 'milla', 'mimi', 'mina', 'minna', 'minou', 'mira', 'miray', 'mirela', 'mirella', 'miriam', 'mirjam', 'mirka',
            'mirna', 'mischa', 'mona', 'monika', 'monique', 'morena', 'morgane', 'mouna', 'muna', 'müjgan', 'nadiia', 'nadine', 'nadja', 'nadya', 'naila', 'naima', 'najla',
            'nala', 'nana', 'nancy', 'nane', 'naomi', 'nara', 'narin', 'nasrin', 'natalia', 'natalie', 'nataliia', 'natascha', 'nathalie', 'nazli', 'nea', 'neela', 'neele',
            'nele', 'nelli', 'nellie', 'nelly', 'nene', 'neri', 'neslihan', 'nessa', 'nestan', 'neva', 'nevena', 'nevin', 'nia', 'nida', 'nienke', 'nika', 'nikole', 'nikolina',
            'nila', 'nilay', 'nilüfer', 'nina', 'nisa', 'nisha', 'noa', 'noemi', 'nola', 'noor', 'nora', 'nova', 'nura', 'odette', 'oksana', 'olena', 'olga', 'olivia',
            'olympia', 'onika', 'ornella', 'oya', 'ozge', 'paige', 'paloma', 'pamela', 'paola', 'paula', 'paulina', 'pauline', 'peggy', 'perla', 'petra', 'philine',
            'philippa', 'pia', 'pinar', 'polina', 'prisca', 'prisila', 'püschel', 'rabia', 'rachael', 'rafaela', 'rahma', 'raissa', 'ramona', 'rana', 'rania', 'raphaela',
            'raquel', 'rebecca', 'regina', 'regina-elisabeth', 'renata', 'renate', 'renee', 'resmiye', 'ria', 'rianna', 'rieke', 'rina', 'rita', 'roberta', 'romy', 'rosa',
            'rosalie', 'rosalind', 'rosanna', 'rosaria', 'rosemarie', 'roswitha', 'roxana', 'roxanne', 'rüya', 'sabine', 'sabrina', 'sadaf', 'safia', 'safiya', 'sahar',
            'sahra', 'salma', 'salome', 'salomea', 'samira', 'sandra', 'sanja', 'sara', 'sarah', 'sarina', 'saskia', 'savannah', 'seda', 'sedef', 'selda', 'selin', 'selina',
            'selma', 'semra', 'serafina', 'serap', 'serena', 'sevda', 'seyma', 'shakira', 'shania', 'sheila', 'sibel', 'sibylle', 'sidney', 'sieglinde', 'sienna', 'silke',
            'silvia', 'simone', 'sina', 'sinem', 'sirona', 'sissi', 'siv', 'sive', 'siyah', 'sofia', 'sofie', 'sofiia', 'sophia', 'sophie', 'soraya', 'stella', 'stephanie',
            'sude', 'sue', 'sultan', 'suna', 'susan', 'susanne', 'suzan', 'suzanne', 'svea', 'svenja', 'svetlana', 'tabea', 'tabita', 'talea', 'talia', 'talya', 'tamara',
            'tamina', 'tanja', 'tara', 'tatiana', 'taya', 'tessa', 'tetiana', 'thalia', 'thea', 'theresa', 'therese', 'thi', 'tilda', 'tina', 'tiziana', 'tonja', 'traudel',
            'tuba', 'tugba', 'tuva', 'tyra', 'ulrike', 'umay', 'ursel', 'ursula', 'valentina', 'valerie', 'valeska', 'vanessa', 'vania', 'vera', 'verena', 'veronica',
            'veronika', 'vicky', 'victoria', 'vida', 'vienna', 'viktoria', 'viola', 'violetta', 'violette', 'virginia', 'vivian', 'viviane', 'vivien', 'vivienne', 'waleria',
            'waltraud', 'wanda', 'wencke', 'wendy', 'wilhelmine', 'willow', 'wilma', 'xandra', 'xenia', 'yara', 'yaren', 'yasemin', 'yasmin', 'yasmina', 'yelena', 'yeliz', 'yesim',
            'yildiz', 'ylva', 'yoko', 'yolanda', 'yuliia', 'yuna', 'yusra', 'yvonne', 'zahra', 'zaida', 'zainab', 'zalina', 'zara', 'zaria', 'zaya', 'zeynep', 'zita', 'zoe',
            'zoey', 'zoja', 'zorica', 'zuzana', 'zuzanna'
          ];
          const GENDER_GUESS_BY_NAME = (() => {
            const maleSet = new Set();
            const femaleSet = new Set();
            MALE_GIVEN_NAMES.forEach(name => {
              const key = normalizeNameForGenderGuess(name);
              if (key) maleSet.add(key);
            });
            FEMALE_GIVEN_NAMES.forEach(name => {
              const key = normalizeNameForGenderGuess(name);
              if (key) femaleSet.add(key);
            });
            const map = new Map();
            maleSet.forEach(name => {
              if (!femaleSet.has(name)) map.set(name, 'm');
            });
            femaleSet.forEach(name => {
              if (!maleSet.has(name)) map.set(name, 'w');
            });
            return map;
          })();
          const isIOSDevice = (() => {
            if (typeof navigator === 'undefined') {
              return false;
            }
            const nav = navigator;
            const ua = typeof nav.userAgent === 'string' ? nav.userAgent : '';
            const platform = typeof nav.platform === 'string' ? nav.platform : '';
            const touchPoints = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
            if (/\b(iPad|iPhone|iPod)\b/i.test(ua) || /\b(iPad|iPhone|iPod)\b/i.test(platform)) {
              return true;
            }
            return /\bMac\b/i.test(platform) && touchPoints > 1;
          })();
          const MESSAGE_VARIANTS = {
            info: { icon: 'ℹ️', className: 'message-info' },
            warn: { icon: '⚠️', className: 'message-warn' },
            error: { icon: '✖️', className: 'message-error' },
            success: { icon: '✔️', className: 'message-success' },
          };
          const queuedMessages = [];

          function ensureMessageHost() {
            let host = document.getElementById('message-stack');
            if (!host) {
              host = document.createElement('div');
              host.id = 'message-stack';
              host.className = 'message-stack';
              host.setAttribute('aria-live', 'polite');
              host.setAttribute('aria-atomic', 'true');
              document.body.appendChild(host);
            }
            return host;
          }
          function removeMessage(node) {
            const host = ensureMessageHost();
            if (node) {
              node.remove();
            }
            if (!host.hasChildNodes()) {
              if (queuedMessages.length > 0) {
                const next = queuedMessages.shift();
                showMessage(next.text, next.variant, next.options);
                return;
              }
              host.classList.remove('active');
            }
          }
          function showMessage(text, variant = 'info', options = {}) {
            if (!text) return;
            const host = ensureMessageHost();
            const shouldEnqueue = !!options.enqueue;
            const messageOptions = { ...options };
            delete messageOptions.enqueue;
            if (shouldEnqueue && host.hasChildNodes()) {
              queuedMessages.push({ text, variant, options: messageOptions });
              return null;
            }
            if (!shouldEnqueue) {
              queuedMessages.length = 0;
            }
            host.textContent = '';
            const config = MESSAGE_VARIANTS[variant] || MESSAGE_VARIANTS.info;
            const node = document.createElement('div');
            node.className = `message ${config.className || ''}`.trim();
            node.setAttribute('role', 'alertdialog');
            const icon = document.createElement('div');
            icon.className = 'message-icon';
            icon.textContent = config.icon || 'ℹ️';
            const body = document.createElement('div');
            body.className = 'message-body';
            body.textContent = text;
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'message-close';
            closeBtn.textContent = messageOptions.buttonLabel || 'OK';
            closeBtn.addEventListener('click', () => removeMessage(node));
            node.appendChild(icon);
            node.appendChild(body);
            node.appendChild(closeBtn);
            host.appendChild(node);
            host.classList.add('active');
            closeBtn.focus({ preventScroll: true });
            setTimeout(() => node.classList.add('show'), 0);
            return node;
          }

          function setSuggestProgress(percent, text) {
            if (!els.suggestProgress || !els.suggestProgressFill || !els.suggestProgressLabel) return;
            const pct = Math.max(0, Math.min(100, percent || 0));
            els.suggestProgress.classList.add('active');
            els.suggestProgress.classList.remove('fade-out');
            els.suggestProgressFill.style.animation = 'none';
            els.suggestProgressFill.style.transform = `scaleX(${pct / 100})`;
            els.suggestProgressLabel.textContent = text || '';
          }

          function setSuggestProgressPercent(percent) {
            if (!els.suggestProgress || !els.suggestProgressFill) return;
            const pct = Math.max(0, Math.min(100, percent || 0));
            els.suggestProgress.classList.add('active');
            els.suggestProgress.classList.remove('fade-out');
            els.suggestProgressFill.style.animation = 'none';
            els.suggestProgressFill.style.transform = `scaleX(${pct / 100})`;
          }

          function setSuggestProgressText(text) {
            if (!els.suggestProgress || !els.suggestProgressLabel) return;
            els.suggestProgress.classList.add('active');
            els.suggestProgress.classList.remove('fade-out');
            els.suggestProgressLabel.textContent = text || '';
          }

          const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          let suggestProgressTimer = null;
          let suggestProgressHideTimeoutId = null;
          let suggestProgressFadeAnims = null;

          function cancelSuggestProgressFadeAnimations() {
            if (!suggestProgressFadeAnims) return;
            try {
              suggestProgressFadeAnims.forEach(anim => {
                try { anim.cancel(); } catch { }
              });
            } finally {
              suggestProgressFadeAnims = null;
            }
          }

          function clearSuggestProgressTimer() {
            if (suggestProgressHideTimeoutId) {
              clearTimeout(suggestProgressHideTimeoutId);
              suggestProgressHideTimeoutId = null;
            }
            if (!suggestProgressTimer) return;
            if (typeof cancelAnimationFrame === 'function' && suggestProgressTimer.rafId) {
              cancelAnimationFrame(suggestProgressTimer.rafId);
            }
            if (suggestProgressTimer.intervalId) {
              clearInterval(suggestProgressTimer.intervalId);
            }
            suggestProgressTimer = null;
          }

          function startTimedSuggestProgress(totalMs, text, startOverrideTs = null) {
            clearSuggestProgressTimer();
            startSuggestProgress(text);
            const durationMs = Math.max(1, Math.floor(totalMs || 0));
            const fill = els.suggestProgressFill;
            if (!fill) return;
            const startTs = Number.isFinite(startOverrideTs) ? startOverrideTs : nowMs();
            const elapsedMs = Math.max(0, nowMs() - startTs);
            suggestProgressTimer = { startTs, durationMs, lastUpdateTs: 0, rafId: 0, intervalId: 0 };

            const frac = Math.max(0, Math.min(1, elapsedMs / durationMs));
            fill.style.animation = 'none';
            fill.style.transition = 'none';
            fill.style.transform = `scaleX(${frac})`;
            void fill.offsetWidth;
            const remainingMs = Math.max(0, durationMs - elapsedMs);
            if (remainingMs <= 0) {
              fill.style.transition = '';
              fill.style.transform = 'scaleX(1)';
              return;
            }
            const run = () => {
              fill.style.transition = `transform ${Math.ceil(remainingMs)}ms linear`;
              fill.style.transform = 'scaleX(1)';
            };
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(run);
            } else {
              setTimeout(run, 0);
            }
          }

          function startSuggestProgress(text) {
            if (!els.suggestProgress || !els.suggestProgressFill || !els.suggestProgressLabel) return;
            clearSuggestProgressTimer();
            cancelSuggestProgressFadeAnimations();
            els.suggestProgress.classList.add('active');
            els.suggestProgress.classList.remove('fade-out');
            els.suggestProgress.style.animation = '';
            els.suggestProgress.style.opacity = '';
            els.suggestProgressFill.style.animation = 'none';
            els.suggestProgressFill.style.transition = '';
            els.suggestProgressFill.style.transform = 'scaleX(0)';
            const inner = els.suggestProgress.querySelector('.progress-inner');
            if (inner) {
              inner.style.opacity = '';
              inner.style.transform = '';
            }
            els.suggestProgressLabel.textContent = text || 'Starte...';
          }

          function finishSuggestProgress(text) {
            if (!els.suggestProgress || !els.suggestProgressFill || !els.suggestProgressLabel) return;
            clearSuggestProgressTimer();
            setSuggestProgress(100, text || 'Fertig');
            setTimeout(() => {
              els.suggestProgress.classList.remove('fade-out');
              void els.suggestProgress.offsetWidth;
              els.suggestProgress.classList.add('fade-out');
              suggestProgressHideTimeoutId = setTimeout(() => {
                els.suggestProgress.classList.remove('active');
                suggestProgressHideTimeoutId = null;
              }, 1500);
            }, 200);
          }

          function fadeOutSuggestProgress() {
            if (!els.suggestProgress || !els.suggestProgressLabel) return;
            cancelSuggestProgressFadeAnimations();
            const timerSnapshot = suggestProgressTimer
              ? { startTs: suggestProgressTimer.startTs, durationMs: suggestProgressTimer.durationMs }
              : null;
            const now = nowMs();
            const remainingToFullMs = timerSnapshot
              ? Math.max(0, (timerSnapshot.startTs + timerSnapshot.durationMs) - now)
              : 0;
            const fill = els.suggestProgressFill;
            let delayBeforeFadeMs = 0;
            if (fill && timerSnapshot && timerSnapshot.durationMs > 0) {
              const frac = Math.max(0, Math.min(1, (now - timerSnapshot.startTs) / timerSnapshot.durationMs));
              const toFullMs = remainingToFullMs > 20 ? Math.min(260, Math.max(120, remainingToFullMs)) : 0;
              fill.style.animation = 'none';
              fill.style.transition = 'none';
              fill.style.transform = `scaleX(${frac})`;
              void fill.offsetWidth;
              if (toFullMs > 0) {
                fill.style.transition = `transform ${toFullMs}ms linear`;
                fill.style.transform = 'scaleX(1)';
                delayBeforeFadeMs = toFullMs;
              } else {
                fill.style.transition = '';
                fill.style.transform = 'scaleX(1)';
              }
            }
            clearSuggestProgressTimer();
            const FADE_MS = 1450;
            const triggerFade = () => {
              if (!els.suggestProgress) return;
              const overlay = els.suggestProgress;
              const inner = overlay.querySelector('.progress-inner');
              overlay.classList.add('fade-out');

              const hasWAAPI = typeof overlay.animate === 'function';
              if (hasWAAPI) {
                const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
                const overlayAnim = overlay.animate(
                  [{ opacity: 1 }, { opacity: 0 }],
                  { duration: FADE_MS, easing, fill: 'forwards' }
                );
                const anims = [overlayAnim];
                if (inner && typeof inner.animate === 'function') {
                  const innerAnim = inner.animate(
                    [
                      { opacity: 1, transform: 'translateY(0) scale(1)' },
                      { opacity: 0, transform: 'translateY(12px) scale(0.985)' }
                    ],
                    { duration: FADE_MS, easing, fill: 'forwards' }
                  );
                  anims.push(innerAnim);
                }
                suggestProgressFadeAnims = anims;
              } else {
                overlay.style.opacity = '1';
                if (inner) {
                  inner.style.opacity = '1';
                  inner.style.transform = 'translateY(0) scale(1)';
                }
                void overlay.offsetWidth;
                overlay.style.transition = `opacity ${FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
                overlay.style.opacity = '0';
                if (inner) {
                  inner.style.transition = `opacity ${FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
                  inner.style.opacity = '0';
                  inner.style.transform = 'translateY(12px) scale(0.985)';
                }
              }
              suggestProgressHideTimeoutId = setTimeout(() => {
                if (!els.suggestProgress) return;
                els.suggestProgress.classList.remove('active');
                els.suggestProgress.classList.remove('fade-out');
                els.suggestProgress.style.opacity = '';
                const inner2 = els.suggestProgress.querySelector('.progress-inner');
                if (inner2) {
                  inner2.style.opacity = '';
                  inner2.style.transform = '';
                  inner2.style.transition = '';
                }
                els.suggestProgress.style.transition = '';
                suggestProgressHideTimeoutId = null;
              }, FADE_MS + 60);
            };
            if (delayBeforeFadeMs > 0) {
              suggestProgressHideTimeoutId = setTimeout(() => {
                suggestProgressHideTimeoutId = null;
                triggerFade();
              }, delayBeforeFadeMs);
            } else {
              triggerFade();
            }
          }

          function stripJsonWarning(text) {
            if (typeof text !== 'string') return '';
            return text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trimStart();
          }

          const state = {
            students: [],
            seats: {},
            gridRows: 10,
            gridCols: 10,
            activeSeats: new Set(),
            dragSourceSeat: null,
            dragPayloadType: null,
            headers: [],
            delim: ',',
            perspectiveFlipped: false,
            csvName: '',
            lastDirectoryHandle: null,
            conditions: {
              teacherDistances: {},
              genderAlternation: false,
            },
            lastActionWasPlanSave: true,
            mergedPairs: new Set(),
            mergeMode: 'allow',
            mergeSymbolsHidden: false,
            mergeToggleValue: 'zulässig',
            seatScoresHidden: false,
            justMergedPairs: new Set(),
            selectedStudentId: null,
            seatDiagnosticsBySeat: new Map(),
            seatDiagnosticsByStudent: new Map(),
            optimalScore: null,
            optimalScoreStale: true,
            optimalScorePending: false,
            optimalScoreVersion: 0,
          };
          const STUDENTS_UPDATED_EVENT = 'classroom:students-updated';
          const SEATPLAN_SHELL_LAYOUT_EVENT = 'classroom:seatplan-shell-layout';
          const STUDENTS_SYNC_SOURCE = 'seatplan';
          const TRUSTED_PARENT_ORIGIN = window.location.origin;
          const ALLOWED_PARENT_MESSAGE_TYPES = new Set([
            SEATPLAN_SHELL_LAYOUT_EVENT,
            STUDENTS_UPDATED_EVENT,
          ]);
          let lastStudentsSyncTimestamp = 0;
          const PREFERENCE_SLOT_COUNT = 3;
          const ALONE_NEIGHBOR_PENALTY = 0.6;
          const BUDDY_ADJACENT_BONUS_ONE_WAY = 0.4;
          const BUDDY_DISTANCE_BASE_BONUS_ONE_WAY = 0.35;
          const MAX_GRID_SIZE = 20;
          const TOUCH_DRAG_DELAY_MS = 90;
          const TOUCH_DRAG_CANCEL_DISTANCE = 10;
          const touchPoints = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0;
          const supportsTouchDrag = typeof window !== 'undefined'
            && (('ontouchstart' in window) || touchPoints > 0);
          let touchDragState = null;
          const MIN_VISIBLE_GRID_DIMENSION = 10;
          const GRID_LAYOUT_DEFAULTS = {
            seatWidth: 90,
            seatHeight: 70,
            gap: 10,
            padding: 8,
          };
          const OPTIMAL_SCORE_THRESHOLDS = {
            good: 0.1,
            warn: 0.25,
          };
          let optimalScoreTimer = null;

          function cloneStudentsForSync(students) {
            if (!Array.isArray(students)) return [];
            return students
              .map((student, index) => {
                if (!student || typeof student !== 'object') return null;
                const rawId = typeof student.id === 'string'
                  ? student.id.trim()
                  : String(student.id ?? '').trim();
                const id = rawId || String(index + 1).padStart(2, '0');
                return {
                  id,
                  first: typeof student.first === 'string' ? student.first : '',
                  last: typeof student.last === 'string' ? student.last : '',
                  buddies: Array.isArray(student.buddies)
                    ? student.buddies.map(v => String(v)).filter(Boolean)
                    : [],
                  foes: Array.isArray(student.foes)
                    ? student.foes.map(v => String(v)).filter(Boolean)
                    : [],
                };
              })
              .filter(Boolean);
          }

          function publishStudentsUpdatedFromSeatplan() {
            if (!window.parent || window.parent === window) return;
            const importedAt = Date.now();
            lastStudentsSyncTimestamp = Math.max(lastStudentsSyncTimestamp, importedAt);
            window.parent.postMessage({
              type: STUDENTS_UPDATED_EVENT,
              detail: {
                source: STUDENTS_SYNC_SOURCE,
                students: cloneStudentsForSync(state.students),
                csvName: state.csvName || '',
                headers: Array.isArray(state.headers) ? state.headers.slice() : [],
                delim: typeof state.delim === 'string' ? state.delim : ',',
                importedAt,
              }
            }, TRUSTED_PARENT_ORIGIN);
          }

          function applySyncedStudents(detail) {
            if (!detail || typeof detail !== 'object') return;
            const importedAt = Number(detail.importedAt);
            if (Number.isFinite(importedAt) && importedAt <= lastStudentsSyncTimestamp) return;
            lastStudentsSyncTimestamp = Number.isFinite(importedAt) ? importedAt : Date.now();
            state.students = cloneStudentsForSync(detail.students);
            state.seats = {};
            state.conditions.teacherDistances = {};
            state.conditions.genderAlternation = state.students.some(student => genderCode(student));
            if (Array.isArray(detail.headers)) {
              state.headers = detail.headers.slice();
            }
            if (typeof detail.delim === 'string' && detail.delim) {
              state.delim = detail.delim;
            }
            if (typeof detail.csvName === 'string') {
              const label = sanitizeExportFileName(detail.csvName);
              state.csvName = label || state.csvName;
              if (els.csvStatus) {
                els.csvStatus.textContent = label || 'Namensliste synchronisiert';
              }
            }
            refreshUnseated();
            renderSeats();
          }

          window.addEventListener('message', (event) => {
            if (!window.parent || event.source !== window.parent) return;
            if (event.origin !== TRUSTED_PARENT_ORIGIN) return;
            const data = event?.data;
            if (!data || typeof data !== 'object') return;
            if (!ALLOWED_PARENT_MESSAGE_TYPES.has(data.type)) return;
            if (data.type === SEATPLAN_SHELL_LAYOUT_EVENT) {
              const detail = data.detail && typeof data.detail === 'object' ? data.detail : null;
              document.documentElement.dataset.shellCollapsed = detail && detail.collapsed ? 'true' : 'false';
              return;
            }
            if (data.type !== STUDENTS_UPDATED_EVENT) return;
            const detail = data.detail;
            if (!detail || typeof detail !== 'object') return;
            if (detail.source === STUDENTS_SYNC_SOURCE) return;
            applySyncedStudents(detail);
          });

          function toggleScrollHint(visible) {
            if (!els.scrollHint) return;
            els.scrollHint.classList.toggle('active', Boolean(visible));
          }
          function setScrollHintText() {
            if (!els.scrollHint) return;
            const textNode = els.scrollHint.querySelector('.text');
            if (!textNode) return;
            const count = Array.isArray(state.students) ? state.students.length : 0;
            if (count > 0) {
              const label = count === 1 ? 'Name' : 'Namen';
              textNode.textContent = `${count} ${label} wurden importiert.`;
            } else {
              textNode.textContent = 'Namen importiert';
            }
          }
          function updateScrollHint() {
            if (!els.scrollHint || !els.sidePanel) return;
            const requiresScroll = (els.sidePanel.scrollHeight - els.sidePanel.clientHeight) > 16;
            const isAtTop = els.sidePanel.scrollTop <= 4;
            setScrollHintText();
            toggleScrollHint(requiresScroll && isAtTop && state.students.length > 0);
          }
          function handleSideScroll() {
            if (!els.sidePanel) return;
            if (els.sidePanel.scrollTop > 4) {
              toggleScrollHint(false);
            }
          }
          function fitPreferencesHintText() {
            const hint = els.preferencesGuessHint;
            if (!hint) return;
            const text = String(hint.textContent || '').trim();
            if (!text) {
              hint.style.fontSize = '';
              return;
            }
            if (hint.clientWidth <= 0) return;
            const maxPx = 14;
            const minPx = 8;
            let size = maxPx;
            hint.style.fontSize = `${size}px`;
            while (size > minPx && hint.scrollWidth > hint.clientWidth) {
              size -= 0.5;
              hint.style.fontSize = `${size}px`;
            }
            if (hint.scrollWidth > hint.clientWidth) {
              hint.style.fontSize = `${minPx}px`;
            }
          }
          els.sidePanel?.addEventListener('scroll', handleSideScroll, { passive: true });
          window.addEventListener('resize', () => {
            updateScrollHint();
            fitPreferencesHintText();
          });

          function normalizeGridDimension(value) {
            if (value === undefined || value === null) return null;
            const parsed = Math.floor(Number(value));
            if (!Number.isFinite(parsed)) return null;
            return Math.min(MAX_GRID_SIZE, Math.max(1, parsed));
          }
          function clampGridDimension(value) {
            return normalizeGridDimension(value) ?? 1;
          }
          function getActiveRows(activeSet) {
            const rows = new Set();
            if (activeSet && typeof activeSet.forEach === 'function') {
              activeSet.forEach(id => {
                const row = parseInt(String(id).split('-')[0], 10);
                if (Number.isFinite(row)) rows.add(row);
              });
            }
            return Array.from(rows).sort((a, b) => a - b);
          }
          function activeRowDistance(activeRows, rowA, rowB) {
            if (!Array.isArray(activeRows) || !activeRows.length) return null;
            const idxA = activeRows.indexOf(rowA);
            const idxB = activeRows.indexOf(rowB);
            if (idxA === -1 || idxB === -1) return null;
            return Math.abs(idxA - idxB);
          }

          function seatId(r, c) { return `${r}-${c}` }
          function displayName(s) { return `${s.first || ''} ${s.last || ''}`.trim(); }
          function normalizeRandomPickerWeight(value, fallback = RANDOM_PICKER_DEFAULT_WEIGHT) {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed)) return fallback;
            if (parsed <= RANDOM_PICKER_MIN_WEIGHT) return RANDOM_PICKER_MIN_WEIGHT;
            if (parsed >= RANDOM_PICKER_CERTAIN_WEIGHT) return RANDOM_PICKER_CERTAIN_WEIGHT;
            if (parsed >= RANDOM_PICKER_MAX_WEIGHT) return RANDOM_PICKER_MAX_WEIGHT;
            if (parsed >= 3) return 3;
            if (parsed >= 2) return 2;
            return RANDOM_PICKER_DEFAULT_WEIGHT;
          }
          function sanitizeRandomPickerStudent(student) {
            if (!student || typeof student !== 'object') return student;
            student.randomWeight = normalizeRandomPickerWeight(student.randomWeight);
            return student;
          }
          function getRandomPickerCandidates({ includeZeroWeight = false } = {}) {
            return state.students
              .map((student) => {
                const name = formatStudentLabel(student);
                if (!name) return null;
                const weight = normalizeRandomPickerWeight(student?.randomWeight);
                return {
                  id: student.id,
                  name,
                  weight,
                };
              })
              .filter((entry) => entry && (includeZeroWeight || entry.weight > 0));
          }
          function getRandomPickerNames({ includeZeroWeight = true } = {}) {
            return getRandomPickerCandidates({ includeZeroWeight }).map((entry) => entry.name);
          }
          function pickWeightedRandomPickerCandidate(candidates) {
            const pool = Array.isArray(candidates)
              ? candidates.filter((entry) => entry && entry.weight > 0)
              : [];
            const certainCandidate = pool.find((entry) => entry.weight === RANDOM_PICKER_CERTAIN_WEIGHT);
            if (certainCandidate) return certainCandidate;
            const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
            if (!pool.length || totalWeight <= 0) return null;
            let threshold = Math.random() * totalWeight;
            for (const entry of pool) {
              threshold -= entry.weight;
              if (threshold < 0) return entry;
            }
            return pool[pool.length - 1] || null;
          }
          function updateRandomPickerCards(centerIndex = 0, { final = false } = {}) {
            if (!els.randomPickerCards?.length) return;
            const allCandidates = getRandomPickerCandidates({ includeZeroWeight: true });
            const names = getRandomPickerNames({ includeZeroWeight: true });
            const total = names.length;
            const cards = Array.from(els.randomPickerCards);
            els.randomPickerWheel?.classList.toggle('is-final', false);
            if (!total) {
              const emptyLabel = allCandidates.length ? 'Keine Auswahl aktiv' : 'Noch keine Namen importiert';
              cards.forEach((card, slotIndex) => {
                const distance = Math.abs(slotIndex - 3);
                card.textContent = emptyLabel;
                card.dataset.distance = String(distance);
                card.classList.toggle('is-final', false);
              });
              randomPickerCurrentIndex = 0;
              return;
            }
            const safeIndex = ((Math.round(centerIndex) % total) + total) % total;
            randomPickerCurrentIndex = safeIndex;
            cards.forEach((card, slotIndex) => {
              const offset = slotIndex - 3;
              const candidateIndex = ((safeIndex + offset) % total + total) % total;
              const distance = Math.abs(offset);
              card.textContent = names[candidateIndex];
              card.dataset.distance = String(Math.min(3, distance));
              card.classList.toggle('is-final', final && offset === 0);
            });
            if (final && typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(() => els.randomPickerWheel?.classList.add('is-final'));
            } else if (final) {
              els.randomPickerWheel?.classList.add('is-final');
            }
          }
          function renderRandomPicker() {
            const allCandidates = getRandomPickerCandidates({ includeZeroWeight: true });
            const candidates = getRandomPickerCandidates();
            const names = allCandidates.map((entry) => entry.name);
            const count = candidates.length;
            if (els.randomPickerCount) {
              els.randomPickerCount.textContent = String(count);
            }
            if (!count) {
              randomPickerSpinInProgress = false;
              if (els.randomPickerResultName) {
                els.randomPickerResultName.textContent = allCandidates.length
                  ? 'Keine Auswahl aktiv'
                  : 'Noch keine Namen importiert';
              }
              if (els.randomPickerResultNote) {
                els.randomPickerResultNote.textContent = allCandidates.length
                  ? 'Alle Einträge stehen auf „unmöglich“. Stelle mindestens einen Eintrag auf „normal“, „doppelt“ oder „dreifach“.'
                  : 'Importiere zuerst eine Namensliste in der Sidebar.';
              }
              if (els.randomPickerActionNote) {
                els.randomPickerActionNote.textContent = allCandidates.length
                  ? 'Lege im Dialog Auswahlbedingungen pro Name „unmöglich“, „normal“, „doppelt“ oder „dreifach“ fest.'
                  : 'Tippe auf den Button, damit der Generator losläuft.';
              }
              if (els.randomPickerStart) {
                els.randomPickerStart.disabled = !allCandidates.length;
                els.randomPickerStart.textContent = 'Start';
              }
              updateRandomPickerCards(0);
              return;
            }
            const safeIndex = Math.min(randomPickerCurrentIndex, Math.max(0, names.length - 1));
            updateRandomPickerCards(safeIndex);
            if (els.randomPickerStart && !randomPickerSpinInProgress) {
              els.randomPickerStart.disabled = false;
            }
            if (els.randomPickerResultName && !randomPickerSpinInProgress) {
              els.randomPickerResultName.textContent = names[safeIndex];
            }
            if (els.randomPickerResultNote) {
              els.randomPickerResultNote.textContent = randomPickerSpinInProgress
                ? 'Der Generator läuft und bremst kontrolliert ab.'
                : 'Die Auswahl erfolgt zufällig aus allen importierten Namen.';
            }
            if (els.randomPickerActionNote && !randomPickerSpinInProgress) {
              els.randomPickerActionNote.textContent = count === 1
                ? 'Es ist nur ein Name verfügbar.'
                : 'Tippe auf den Button, damit der Generator losläuft.';
            }
          }
          async function startRandomPickerSpin() {
            const allCandidates = getRandomPickerCandidates({ includeZeroWeight: true });
            if (!allCandidates.length) {
              showMessage('Importiere zuerst die Namensliste!', 'warn');
              return;
            }
            const candidates = allCandidates.filter((entry) => entry.weight > 0);
            if (!candidates.length) {
              showMessage('Für den Picker ist aktuell kein Name auf „normal“, „doppelt“ oder „dreifach“ gesetzt.', 'warn');
              return;
            }
            const names = candidates.map((entry) => entry.name);
            if (randomPickerSpinInProgress) return;
            randomPickerSpinInProgress = true;
            if (els.randomPickerStart) {
              els.randomPickerStart.disabled = true;
              els.randomPickerStart.textContent = 'Läuft...';
            }
            if (els.randomPickerResultNote) {
              els.randomPickerResultNote.textContent = 'Der Generator läuft und bremst kontrolliert ab.';
            }
            if (els.randomPickerActionNote) {
              els.randomPickerActionNote.textContent = 'Zufallsgenerator läuft...';
            }
            try {
              const total = names.length;
              const winner = pickWeightedRandomPickerCandidate(candidates);
              const winnerIndex = Math.max(0, candidates.findIndex((entry) => entry.id === winner?.id));
              const loops = total <= 1 ? 0 : Math.max(2, Math.ceil(14 / total));
              const totalSteps = total <= 1
                ? 1
                : Math.max(18, (loops * total) + winnerIndex - randomPickerCurrentIndex + (winnerIndex >= randomPickerCurrentIndex ? 0 : total));
              for (let step = 1; step <= totalSteps; step += 1) {
                const progress = step / totalSteps;
                const eased = progress * progress;
                const frameIndex = total <= 1 ? winnerIndex : (randomPickerCurrentIndex + 1) % total;
                updateRandomPickerCards(frameIndex, { final: false });
                const delayMs = 48 + Math.round(eased * 380);
                await waitMs(delayMs);
              }
              updateRandomPickerCards(winnerIndex, { final: true });
              if (els.randomPickerResultName) {
                els.randomPickerResultName.textContent = names[winnerIndex];
              }
              if (els.randomPickerResultNote) {
                els.randomPickerResultNote.textContent = 'Der Zufallsgenerator ist stehen geblieben.';
              }
              if (els.randomPickerActionNote) {
                els.randomPickerActionNote.textContent = `Gewählt wurde: ${names[winnerIndex]}`;
              }
              if (els.randomPickerStart) {
                els.randomPickerStart.textContent = 'Nochmal';
              }
            } finally {
              randomPickerSpinInProgress = false;
              if (els.randomPickerStart) {
                els.randomPickerStart.disabled = false;
                if (els.randomPickerStart.textContent.trim() === 'Läuft...') {
                  els.randomPickerStart.textContent = 'Start';
                }
              }
            }
          }
          function formatStudentLabel(student) {
            if (!student) return '';
            const name = displayName(student);
            return name || `ID ${student.id || ''}`.trim();
          }
          function hasBuddyPreference(student, otherId) {
            if (!student || !otherId) return false;
            return getBuddyList(student).includes(otherId);
          }
          function getBuddyList(student) {
            if (!student || student.prefersAlone) return [];
            return Array.isArray(student.buddies) ? student.buddies : [];
          }
          function buddyCount(student) {
            return getBuddyList(student).length;
          }
          function hasFoePreference(student, otherId) {
            if (!student || !otherId) return false;
            return Array.isArray(student.foes) && student.foes.includes(otherId);
          }
          function genderCode(student) {
            const g = (student?.genderPref || '').trim().toLowerCase();
            return g === 'm' || g === 'w' ? g : null;
          }
          function normalizeNameForGenderGuess(value) {
            return String(value || '')
              .trim()
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z]/g, '');
          }
          function guessGenderFromFirstName(firstName) {
            const raw = String(firstName || '').trim();
            if (!raw) return null;
            const candidates = [];
            const full = normalizeNameForGenderGuess(raw);
            if (full) candidates.push(full);
            raw.split(/[\s-]+/).forEach(part => {
              const normalized = normalizeNameForGenderGuess(part);
              if (normalized && !candidates.includes(normalized)) {
                candidates.push(normalized);
              }
            });
            for (let i = 0; i < candidates.length; i++) {
              const guessed = GENDER_GUESS_BY_NAME.get(candidates[i]);
              if (guessed) return guessed;
            }
            return null;
          }
          function applyGenderGuessInPreferences() {
            if (!els.preferencesTableBody) return;
            const studentsById = new Map((state.students || []).map(student => [student.id, student]));
            const allGenderInputs = Array.from(
              els.preferencesTableBody.querySelectorAll('input[data-student-id][data-gender-choice]')
            );
            if (!allGenderInputs.length) {
              if (els.preferencesGuessHint) {
                els.preferencesGuessHint.textContent = 'Keine Lernenden für den Geschlechtervorschlag vorhanden.';
                els.preferencesGuessHint.title = 'Keine Lernenden für den Geschlechtervorschlag vorhanden.';
                fitPreferencesHintText();
              } else {
                showMessage('Keine Lernenden für den Geschlechtervorschlag vorhanden.', 'warn');
              }
              return;
            }

            const inputsByStudent = new Map();
            allGenderInputs.forEach(input => {
              const sid = input.dataset.studentId;
              if (!sid) return;
              if (!inputsByStudent.has(sid)) inputsByStudent.set(sid, []);
              inputsByStudent.get(sid).push(input);
            });

            inputsByStudent.forEach((inputs, sid) => {
              if (inputs.some(input => input.checked)) return;
              const student = studentsById.get(sid);
              const guessedGender = guessGenderFromFirstName(student?.first || '');
              if (!guessedGender) return;
              inputs.forEach(input => {
                input.checked = input.dataset.genderChoice === guessedGender;
              });
            });
            const hintText = 'Geschlecht vermutet - bitte überprüfen! Kriterium durch Haken aktiv.';
            if (els.preferencesGuessHint) {
              els.preferencesGuessHint.textContent = hintText;
              els.preferencesGuessHint.title = hintText;
              fitPreferencesHintText();
            } else {
              showMessage(hintText, 'info');
            }
          }
          function resetGenderAssignmentsInPreferences() {
            if (!els.preferencesTableBody) return;
            const allGenderInputs = Array.from(
              els.preferencesTableBody.querySelectorAll('input[data-student-id][data-gender-choice]')
            );
            if (!allGenderInputs.length) return;
            allGenderInputs.forEach(input => {
              input.checked = false;
            });
            const hintText = 'Geschlecht zurückgesetzt. Mit Speichern übernehmen.';
            if (els.preferencesGuessHint) {
              els.preferencesGuessHint.textContent = hintText;
              els.preferencesGuessHint.title = hintText;
              fitPreferencesHintText();
            } else {
              showMessage(hintText, 'info');
            }
          }
          function updatePreferenceOptionDisablingForStudent(studentId) {
            if (!els.preferencesTableBody || !studentId) return;

            const selects = els.preferencesTableBody.querySelectorAll(
              'select[data-student-id="' + studentId + '"][data-pref-type]'
            );
            if (!selects.length) return;

            const used = new Set();
            selects.forEach(sel => {
              const val = sel.value;
              if (val) {
                used.add(val);
              }
            });
            selects.forEach(sel => {
              const current = sel.value;
              const options = sel.querySelectorAll('option');
              options.forEach(opt => {
                if (!opt.value) {
                  opt.disabled = false;
                  return;
                }
                opt.disabled = used.has(opt.value) && opt.value !== current;
              });
            });
          }

          function syncBuddyPreferenceAvailability(studentId) {
            if (!els.preferencesTableBody || !studentId) return;
            const aloneToggle = els.preferencesTableBody.querySelector(
              `input[data-student-id="${studentId}"][data-preference="alone"]`
            );
            const aloneActive = !!aloneToggle?.checked;
            const buddySelects = els.preferencesTableBody.querySelectorAll(
              `select[data-student-id="${studentId}"][data-pref-type="buddy"]`
            );
            buddySelects.forEach(sel => {
              sel.disabled = aloneActive;
              sel.title = aloneActive ? 'Deaktiviert, weil „alleine“ aktiv ist.' : '';
              const cell = sel.closest('td');
              if (cell) cell.classList.toggle('buddy-disabled', aloneActive);
            });
          }

          function buildSeatPreferencesTable() {
            if (!els.preferencesTableBody) return;
            els.preferencesTableBody.innerHTML = '';
            const ordered = state.students.slice().sort((a, b) => {
              const nameA = formatStudentLabel(a).toLowerCase();
              const nameB = formatStudentLabel(b).toLowerCase();
              if (nameA < nameB) return -1;
              if (nameA > nameB) return 1;
              return 0;
            });
            ordered.forEach(student => {
              els.preferencesTableBody.appendChild(createPreferenceRow(student, ordered));
            });
            ordered.forEach(student => {
              updatePreferenceOptionDisablingForStudent(student.id);
              syncBuddyPreferenceAvailability(student.id);
            });
          }
          function createPreferenceRow(student, optionsList) {
            const row = document.createElement('tr');
            const nameCell = document.createElement('th');
            nameCell.scope = 'row';
            nameCell.className = 'name-cell';
            nameCell.textContent = formatStudentLabel(student);
            row.appendChild(nameCell);
            const genderCell = document.createElement('td');
            genderCell.className = 'gender-cell';
            genderCell.appendChild(createGenderGroup(student));
            row.appendChild(genderCell);
            const distanceCell = document.createElement('td');
            distanceCell.className = 'distance-cell';
            distanceCell.appendChild(createFrontCheckbox(student));
            row.appendChild(distanceCell);
            const aloneCell = document.createElement('td');
            aloneCell.className = 'alone-cell';
            aloneCell.appendChild(createAloneCheckbox(student));
            row.appendChild(aloneCell);
            for (let i = 0; i < PREFERENCE_SLOT_COUNT; i++) {
              row.appendChild(createPreferenceCell(student, 'buddy', i, optionsList));
            }
            for (let i = 0; i < PREFERENCE_SLOT_COUNT; i++) {
              row.appendChild(createPreferenceCell(student, 'foe', i, optionsList));
            }
            return row;
          }
          function createFrontCheckbox(student) {
            const label = document.createElement('label');
            label.className = 'front-checkbox';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.tabIndex = -1;
            input.dataset.studentId = student.id;
            input.dataset.distance = 'front';
            const existingMap = getTeacherDistanceMap();
            const existing = existingMap.get(student.id);
            input.checked = Number.isInteger(existing);
            label.appendChild(input);
            return label;
          }
          function createAloneCheckbox(student) {
            const label = document.createElement('label');
            label.className = 'alone-checkbox';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.tabIndex = -1;
            input.dataset.studentId = student.id;
            input.dataset.preference = 'alone';
            input.checked = !!student?.prefersAlone;
            label.appendChild(input);
            return label;
          }
          function createGenderGroup(student) {
            const group = document.createElement('div');
            group.className = 'gender-group';
            const current = (student.genderPref || '').toLowerCase();
            const options = [
              { value: 'm', label: 'm' },
              { value: 'w', label: 'w' },
              { value: 'd', label: 'd' },
            ];
            options.forEach(opt => {
              const label = document.createElement('label');
              label.className = 'gender-choice';
              const input = document.createElement('input');
              input.type = 'checkbox';
              input.tabIndex = -1;
              input.dataset.studentId = student.id;
              input.dataset.genderChoice = opt.value;
              input.checked = current === opt.value;
              const span = document.createElement('span');
              span.textContent = opt.label;
              label.appendChild(input);
              label.appendChild(span);
              group.appendChild(label);
            });
            return group;
          }
          function createPreferenceCell(student, type, slotIndex, optionsList) {
            const cell = document.createElement('td');
            cell.className = type === 'buddy' ? 'buddy-col' : 'foe-col';
            const select = document.createElement('select');
            select.dataset.studentId = student.id;
            select.dataset.prefType = type;
            select.dataset.prefSlot = String(slotIndex);
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'beliebig';
            select.appendChild(placeholder);
            optionsList.forEach(optionStudent => {
              if (!optionStudent || optionStudent.id === student.id) return;
              const option = document.createElement('option');
              option.value = optionStudent.id;
              option.textContent = formatStudentLabel(optionStudent);
              select.appendChild(option);
            });
            const source = type === 'buddy' ? (student.buddies || []) : (student.foes || []);
            select.value = source[slotIndex] || '';
            const wrap = document.createElement('div');
            wrap.className = 'select-wrap';
            wrap.appendChild(select);
            cell.appendChild(wrap);
            return cell;
          }
          function savePreferencesFromForm() {
            if (!els.preferencesTableBody) return;
            const controls = els.preferencesTableBody.querySelectorAll('select, input[type="checkbox"][data-student-id]');
            const buddyMap = new Map();
            const foeMap = new Map();
            const distanceMap = {};
            const genderMap = {};
            const aloneSet = new Set();
            controls.forEach(control => {
              const sid = control.dataset.studentId;
              if (!sid) return;
              if (control.dataset.distance === 'front') {
                if (control.checked) {
                  distanceMap[sid] = 2;
                }
                return;
              }
              if (control.dataset.preference === 'alone') {
                if (control.checked) {
                  aloneSet.add(sid);
                }
                return;
              }
              if (control.dataset.genderChoice) {
                if (control.checked) {
                  genderMap[sid] = control.dataset.genderChoice;
                }
                return;
              }
              const type = control.dataset.prefType;
              const slot = Number(control.dataset.prefSlot);
              if (!sid || Number.isNaN(slot)) return;
              const map = type === 'foe' ? foeMap : buddyMap;
              if (!map.has(sid)) {
                map.set(sid, Array(PREFERENCE_SLOT_COUNT).fill(''));
              }
              map.get(sid)[slot] = control.value || '';
            });
            state.students.forEach(student => {
              const buddySlots = buddyMap.get(student.id) || [];
              const foeSlots = foeMap.get(student.id) || [];
              applyPreferenceSlots(student, buddySlots, 'buddy');
              applyPreferenceSlots(student, foeSlots, 'foe');
              student.genderPref = genderMap[student.id] || '';
              student.prefersAlone = aloneSet.has(student.id);
            });
            state.conditions.teacherDistances = distanceMap;
            state.conditions.genderAlternation = Object.keys(genderMap).length > 0;
            if (state.conditions.genderAlternation) {
              const missingGenderStudents = state.students.filter(student => !genderMap[student.id]);
              if (missingGenderStudents.length > 0) {
                const names = missingGenderStudents
                  .map(student => formatStudentLabel(student))
                  .filter(Boolean);
                const preview = names.slice(0, 5).join(', ');
                const suffix = names.length > 5 ? ` (+${names.length - 5} weitere)` : '';
                showMessage(
                  `„m/w abwechselnd“ ist aktiv, aber bei ${missingGenderStudents.length} Lernenden ist noch kein Geschlecht zugeordnet (${preview}${suffix}).`,
                  'info',
                  { enqueue: true }
                );
              }
            }

            const conflicts = findBuddyFoeConflicts(state.students);
            if (conflicts.length) {
              const primary = conflicts[0];
              const nameA = formatStudentLabel(primary.buddyOwner);
              const nameB = formatStudentLabel(primary.foeOwner);
              showMessage(
                `${nameA} hat ${nameB} als guten Sitznachbarn, aber ${nameB} hat ${nameA} als schlechten Sitznachbarn gewählt.`,
                'warn',
                { enqueue: true }
              );
            }
            markOptimalScoreStale();
            updateSidebarScore();
          }
          function applyPreferenceSlots(student, slots, variant) {
            const entries = [];
            const seen = new Set();
            slots.forEach(value => {
              if (!value || value === student.id || seen.has(value)) return;
              seen.add(value);
              entries.push(value);
            });
            if (variant === 'buddy') {
              student.buddies = entries;
            } else {
              student.foes = entries;
            }
          }
          function findBuddyFoeConflicts(students) {
            if (!Array.isArray(students)) return [];
            const byId = new Map();
            students.forEach(s => {
              if (s && s.id) byId.set(s.id, s);
            });
            const conflicts = [];
            students.forEach(student => {
              if (!student || student.prefersAlone) return;
              const buddies = getBuddyList(student);
              if (!buddies.length) return;
              buddies.forEach(otherId => {
                if (!otherId) return;
                const other = byId.get(otherId);
                if (!other || !Array.isArray(other.foes)) return;
                if (other.foes.includes(student.id)) {
                  conflicts.push({ buddyOwner: student, foeOwner: other });
                }
              });
            });
            return conflicts;
          }
          function isSeatWithinBounds(id, rows, cols) {
            if (!id) return false;
            const [rStr, cStr] = id.split('-');
            const r = parseInt(rStr, 10);
            const c = parseInt(cStr, 10);
            if (!Number.isFinite(r) || !Number.isFinite(c)) return false;
            return r >= 1 && r <= rows && c >= 1 && c <= cols;
          }
          function sanitizeSeatIdWithinLimit(id, maxRows = MAX_GRID_SIZE, maxCols = MAX_GRID_SIZE) {
            if (typeof id !== 'string') return null;
            const [rStr, cStr] = id.split('-');
            const r = parseInt(rStr, 10);
            const c = parseInt(cStr, 10);
            if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
            if (r < 1 || r > maxRows || c < 1 || c > maxCols) return null;
            return seatId(r, c);
          }
          function enforceGridBounds() {
            const rows = clampGridDimension(state.gridRows);
            const cols = clampGridDimension(state.gridCols);
            state.gridRows = rows;
            state.gridCols = cols;
            const filterSet = (set) => {
              const next = new Set();
              set.forEach(id => {
                if (isSeatWithinBounds(id, rows, cols)) next.add(id);
              });
              return next;
            };
            state.activeSeats = filterSet(state.activeSeats);
            const trimmedSeats = {};
            Object.entries(state.seats).forEach(([id, val]) => {
              if (isSeatWithinBounds(id, rows, cols)) {
                trimmedSeats[id] = val ?? null;
              }
            });
            state.seats = trimmedSeats;
          }
          function sanitizePlanLabel(raw) {
            if (raw === undefined || raw === null) return '';
            const normalized = String(raw).trim();
            if (!normalized) return '';
            const stripped = normalized
              .replace(/jahrgang\.?/gi, '')
              .replace(/klasse\.?/gi, '')
              .replace(/\s+/g, ' ')
              .trim();
            return stripped;
          }
          function extractPlanLabelFromRows(rows) {
            if (!Array.isArray(rows) || rows.length < 2) return '';
            const secondRow = rows[1];
            if (!Array.isArray(secondRow) || !secondRow.length) return '';
            return sanitizePlanLabel(secondRow[0]);
          }

          function applyPerspectiveView() {
            const flipped = !!state.perspectiveFlipped;
            if (els.grid) {
              els.grid.classList.toggle('perspective-flipped', flipped);
            }
            if (els.flipPerspective) {
              els.flipPerspective.setAttribute('aria-pressed', flipped ? 'true' : 'false');
              els.flipPerspective.title = flipped
                ? 'Sitzplan wieder aus Sicht der Vorderseite anzeigen'
                : 'Sitzplan horizontal spiegeln';
            }
          }

          function getTeacherDistanceMap() {
            const raw = state.conditions?.teacherDistances;
            const map = new Map();
            if (Array.isArray(raw)) {
              raw.forEach(entry => {
                if (!entry || typeof entry !== 'object') return;
                const sid = typeof entry.studentId === 'string' ? entry.studentId.trim() : '';
                const dist = parseInt(entry.maxDistance, 10);
                if (sid && Number.isInteger(dist) && dist >= 0) {
                  const normalized = dist <= 0 ? 2 : dist;
                  map.set(sid, normalized);
                }
              });
            } else if (raw && typeof raw === 'object') {
              Object.entries(raw).forEach(([sid, distVal]) => {
                const sidNorm = typeof sid === 'string' ? sid.trim() : '';
                const dist = parseInt(distVal, 10);
                if (sidNorm && Number.isInteger(dist) && dist >= 0) {
                  const normalized = dist <= 0 ? 2 : dist;
                  map.set(sidNorm, normalized);
                }
              });
            }
            return map;
          }

          function createPlanSnapshot() {
            if (!state.activeSeats.size) {
              showMessage('Keine aktiven Sitzplätze vorhanden.', 'warn');
              return null;
            }
            const activeIds = Array.from(state.activeSeats);
            const seatSnapshot = {};
            activeIds.forEach(id => {
              seatSnapshot[id] = state.seats[id] || null;
            });
            const teacherDistances = Array.from(getTeacherDistanceMap().entries()).map(([studentId, maxDistance]) => ({ studentId, maxDistance }));
            const mergedPairs = Array.from(state.mergedPairs || []).map(key => {
              const parts = (key || '').split('|');
              return parts.length === 2 ? parts : null;
            }).filter(Boolean);
            return {
              version: 1,
              generatedAt: new Date().toISOString(),
              grid: { rows: state.gridRows, cols: state.gridCols },
              activeSeats: activeIds,
              seats: seatSnapshot,
              mergedPairs,
              students: state.students,
              headers: state.headers,
              delim: state.delim,
              csvName: state.csvName || '',
              conditions: {
                teacherDistances: teacherDistances.map(entry => {
                  if (!entry) return null;
                  return {
                    studentId: entry.studentId || '',
                    maxDistance: entry.maxDistance ?? null,
                  };
                }),
                genderAlternation: !!state.conditions?.genderAlternation,
              },
              mergeSettings: {
                toggleValue: state.mergeToggleValue || 'zulässig',
                mode: state.mergeMode || 'allow',
                symbolsHidden: !!state.mergeSymbolsHidden,
              },
              seatScoresHidden: !!state.seatScoresHidden,
            };
          }

          function sanitizeExportFileName(name) {
            const raw = typeof name === 'string' ? name : '';
            const trimmed = raw.trim();
            const safe = trimmed.replace(/[\\\/:*?"<>|]/g, '-');
            return safe || 'Sitzplan';
          }

          function getDefaultPlanBaseName() {
            return state.csvName ? `${state.csvName} (Sitzplan)` : 'Sitzplan';
          }

          function getSuggestedPlanFileName() {
            return sanitizeExportFileName(getDefaultPlanBaseName());
          }

          function ensureJsonFilename(name) {
            const normalized = (typeof name === 'string' ? name : '').trim() || 'Sitzplan';
            return normalized.toLowerCase().endsWith('.json') ? normalized : `${normalized}.json`;
          }

          async function savePlanWithPicker(blob, filename) {
            const finalName = ensureJsonFilename(filename);
            const canUsePicker = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
            if (!canUsePicker) return 'fallback';
            try {
              const handle = await window.showSaveFilePicker({
                suggestedName: finalName,
                startIn: state.lastDirectoryHandle || 'downloads',
                types: [{
                  description: 'Sitzplan JSON',
                  accept: { 'application/json': ['.json'] }
                }],
              });
              const writable = await handle.createWritable();
              await writable.write(blob);
              await writable.close();
              state.lastDirectoryHandle = handle || state.lastDirectoryHandle;
              return 'saved';
            } catch (err) {
              if (err && err.name === 'AbortError') {
                return 'aborted';
              }
              console.warn('Fallback auf Download, Speichern via Picker fehlgeschlagen:', err);
              return 'fallback';
            }
          }

          function triggerBlobDownload(blob, filename, options = {}) {
            const {
              defaultName = 'download',
              forceJsonExtension = false,
              iosDelay = 4000,
              defaultDelay = 1200,
              onErrorMessage = null,
            } = options;
            const normalizedName = (typeof filename === 'string' ? filename : '').trim() || defaultName;
            const finalName = forceJsonExtension ? ensureJsonFilename(normalizedName) : normalizedName;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = finalName;
            link.rel = 'noopener';
            link.style.display = 'none';
            const parent = document.body || document.documentElement;
            if (parent) {
              parent.appendChild(link);
            }
            try {
              if (typeof link.click === 'function') {
                link.click();
              } else {
                const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                link.dispatchEvent(evt);
              }
            } catch (err) {
              if (onErrorMessage) {
                console.warn(onErrorMessage, err);
              } else {
                console.warn('Download konnte nicht gestartet werden:', err);
              }
            }
            const cleanup = () => {
              if (link.parentNode) {
                link.remove();
              }
              URL.revokeObjectURL(url);
            };
            const delay = isIOSDevice ? iosDelay : defaultDelay;
            setTimeout(cleanup, delay);
          }

          function triggerPlanDownload(blob, filename) {
            triggerBlobDownload(blob, filename, {
              defaultName: 'Gruppen',
              forceJsonExtension: true,
              iosDelay: 4000,
              defaultDelay: 1200,
            });
          }

          function downloadCsvTemplate() {
            const blob = new Blob([TEMPLATE_CSV_CONTENT], { type: 'text/csv;charset=utf-8;' });
            triggerBlobDownload(blob, TEMPLATE_CSV_NAME, {
              defaultName: TEMPLATE_CSV_NAME,
              forceJsonExtension: false,
              iosDelay: 6000,
              defaultDelay: 2500,
              onErrorMessage: 'CSV-Download konnte nicht gestartet werden:',
            });
          }

          async function downloadSeatPlan() {
            const snapshot = createPlanSnapshot();
            if (!snapshot) return;
            const defaultName = getSuggestedPlanFileName();
            let nameInput = defaultName;
            if (!isIOSDevice) {
              const desiredName = prompt('Bitte gib einen Dateinamen ein:', defaultName);
              if (desiredName === null) return;
              nameInput = desiredName || '';
            }
            const safeName = sanitizeExportFileName(nameInput);
            const prettyJson = JSON.stringify(snapshot, null, 2);
            const blob = new Blob([prettyJson], { type: 'application/json' });
            const saveStatus = await savePlanWithPicker(blob, safeName);
            if (saveStatus === 'aborted') {
              return;
            }
            if (saveStatus === 'fallback') {
              triggerPlanDownload(blob, safeName);
            }
            showMessage('Man kann den Sitzplan NICHT durch Anklicken der eben erstellten Datenbankdatei öffnen.\n\nStattdessen muss man die Datenbankdatei hier im Sitzplangenerator über „Sitzplan laden“ auswählen oder sie irgendwo in den Sitzplangenerator ziehen.', 'info');
            markPlanSavedAction();
          }

          function printSeatPlan() {
            if (typeof window === 'undefined' || typeof window.print !== 'function') {
              showMessage('Drucken wird vom Browser nicht unterstützt.', 'warn');
              return;
            }
            if (els.printPlanTitle) {
              els.printPlanTitle.textContent = getSuggestedPlanFileName();
            }
            applyPrintScale();
            requestAnimationFrame(() => {
              try {
                window.print();
              } finally {
                resetPrintScale();
              }
            });
          }

          let printScaleApplied = false;
          function measurePrintTitleBlockHeight(maxWidth) {
            if (!els.printPlanTitle) return 0;
            const titleEl = els.printPlanTitle;
            const prev = {
              display: titleEl.style.display,
              position: titleEl.style.position,
              left: titleEl.style.left,
              top: titleEl.style.top,
              visibility: titleEl.style.visibility,
              pointerEvents: titleEl.style.pointerEvents,
              width: titleEl.style.width,
              maxWidth: titleEl.style.maxWidth,
            };
            const width = Math.max(120, Math.floor(maxWidth || 120));
            titleEl.style.display = 'block';
            titleEl.style.position = 'fixed';
            titleEl.style.left = '0';
            titleEl.style.top = '0';
            titleEl.style.visibility = 'hidden';
            titleEl.style.pointerEvents = 'none';
            titleEl.style.width = `${width}px`;
            titleEl.style.maxWidth = `${width}px`;
            const rect = titleEl.getBoundingClientRect();
            const style = getComputedStyle(titleEl);
            const marginTop = parseFloat(style.marginTop) || 0;
            const marginBottom = parseFloat(style.marginBottom) || 0;
            titleEl.style.display = prev.display;
            titleEl.style.position = prev.position;
            titleEl.style.left = prev.left;
            titleEl.style.top = prev.top;
            titleEl.style.visibility = prev.visibility;
            titleEl.style.pointerEvents = prev.pointerEvents;
            titleEl.style.width = prev.width;
            titleEl.style.maxWidth = prev.maxWidth;
            return Math.max(0, rect.height + marginTop + marginBottom);
          }

          function applyPrintScale() {
            const target = els.grid || els.gridWrap;
            if (!target) return;
            const rect = target.getBoundingClientRect();
            const marginMm = 8; // must match @page margin
            const mmPerIn = 25.4;
            const marginIn = marginMm / mmPerIn;
            const a4Landscape = { widthIn: 297 / mmPerIn, heightIn: 210 / mmPerIn };
            const letterLandscape = { widthIn: 11, heightIn: 8.5 };
            const printableWidthIn = Math.min(
              a4Landscape.widthIn - 2 * marginIn,
              letterLandscape.widthIn - 2 * marginIn
            );
            const printableHeightIn = Math.min(
              a4Landscape.heightIn - 2 * marginIn,
              letterLandscape.heightIn - 2 * marginIn
            );
            const pxPerIn = 96;
            const pageWidthPx = printableWidthIn * pxPerIn;
            const pageHeightPx = printableHeightIn * pxPerIn;
            const roundingReservePx = 6;
            const maxWidth = Math.max(1, pageWidthPx - roundingReservePx);
            const titleBlockHeight = measurePrintTitleBlockHeight(maxWidth);
            const maxHeight = Math.max(1, pageHeightPx - roundingReservePx - titleBlockHeight);
            if (!rect.width || !rect.height) {
              document.documentElement.style.setProperty('--print-scale', '1');
              printScaleApplied = true;
              return;
            }
            const rawScale = Math.min(1, maxWidth / rect.width, maxHeight / rect.height);
            const precisionReserve = rawScale < 1 ? 0.002 : 0;
            const scale = Math.max(0.05, rawScale - precisionReserve);
            document.documentElement.style.setProperty('--print-scale', scale.toFixed(3));
            printScaleApplied = true;
          }

          function resetPrintScale() {
            if (!printScaleApplied) return;
            document.documentElement.style.setProperty('--print-scale', '1');
            printScaleApplied = false;
          }

          if (typeof window !== 'undefined') {
            window.addEventListener('beforeprint', applyPrintScale);
            window.addEventListener('afterprint', resetPrintScale);
          }

          function applyPlanData(data) {
            if (!data || typeof data !== 'object') throw new Error('Ungültiges Plan-Format.');
            const incomingStudents = Array.isArray(data.students) ? data.students : [];
            const incomingSeats = data.seats && typeof data.seats === 'object' ? data.seats : {};
            const incomingActive = Array.isArray(data.activeSeats) ? data.activeSeats.filter(Boolean) : [];
            const incomingMerged = Array.isArray(data.mergedPairs) ? data.mergedPairs : [];
            const incomingCsvName = typeof data.csvName === 'string' ? data.csvName : '';
            const seatAssignments = new Map();
            const seatIds = new Set();
            const registerSeat = (rawId) => {
              const normalized = sanitizeSeatIdWithinLimit(rawId);
              if (!normalized) return null;
              seatIds.add(normalized);
              return normalized;
            };
            incomingActive.forEach(registerSeat);
            Object.entries(incomingSeats).forEach(([id, val]) => {
              const normalized = registerSeat(id);
              if (normalized) seatAssignments.set(normalized, val);
            });
            if (!seatIds.size) throw new Error('Plan enthält keine Sitzplätze.');
            const maxFromIds = (idx) => {
              let max = 1;
              seatIds.forEach(id => {
                const parts = id.split('-').map(Number);
                const val = parts[idx];
                if (Number.isFinite(val) && val > max) max = val;
              });
              return max;
            };
            const planRows = normalizeGridDimension(data.grid?.rows);
            const planCols = normalizeGridDimension(data.grid?.cols);
            const requiredRows = maxFromIds(0);
            const requiredCols = maxFromIds(1);
            const currentRows = clampGridDimension(state.gridRows);
            const currentCols = clampGridDimension(state.gridCols);
            state.gridRows = planRows !== null
              ? clampGridDimension(Math.max(planRows, requiredRows))
              : clampGridDimension(Math.max(currentRows, requiredRows));
            state.gridCols = planCols !== null
              ? clampGridDimension(Math.max(planCols, requiredCols))
              : clampGridDimension(Math.max(currentCols, requiredCols));
            state.students = incomingStudents.map(student => {
              if (!student || typeof student !== 'object') return student;
              if (!Array.isArray(student.buddies)) student.buddies = [];
              if (!Array.isArray(student.foes)) student.foes = [];
              student.prefersAlone = Boolean(student.prefersAlone);
              return student;
            });
            state.headers = Array.isArray(data.headers) ? data.headers : [];
            state.delim = typeof data.delim === 'string' ? data.delim : ',';
            state.csvName = incomingCsvName || '';
            const incomingConditions = data.conditions && typeof data.conditions === 'object' ? data.conditions : {};
            const incomingTeacherRaw = incomingConditions.teacherDistances;
            const incomingTeacherDists = Array.isArray(incomingTeacherRaw)
              ? incomingTeacherRaw
              : (incomingTeacherRaw && typeof incomingTeacherRaw === 'object'
                ? Object.entries(incomingTeacherRaw).map(([studentId, maxDistance]) => ({ studentId, maxDistance }))
                : []);
            state.activeSeats = new Set(seatIds);
            const restoredMerges = new Set();
            incomingMerged.forEach(entry => {
              let a = null; let b = null;
              if (Array.isArray(entry)) {
                [a, b] = entry;
              } else if (typeof entry === 'string') {
                const parts = entry.split('|');
                if (parts.length === 2) { [a, b] = parts; }
              }
              const aNorm = sanitizeSeatIdWithinLimit(a);
              const bNorm = sanitizeSeatIdWithinLimit(b);
              if (!aNorm || !bNorm) return;
              if (!seatIds.has(aNorm) || !seatIds.has(bNorm)) return;
              const key = pairKey(aNorm, bNorm);
              if (key) restoredMerges.add(key);
            });
            state.mergedPairs = restoredMerges;
            state.seats = {};
            seatIds.forEach(id => {
              state.seats[id] = seatAssignments.has(id) ? (seatAssignments.get(id) || null) : null;
            });
            const teacherSeatIds = Object.entries(state.seats).filter(([, v]) => v === 'TEACHER').map(([id]) => id);
            removeMergesInvolving(teacherSeatIds);
            const restored = {};
            incomingTeacherDists.forEach(entry => {
              if (entry && typeof entry === 'object') {
                const sId = typeof entry.studentId === 'string' ? entry.studentId.trim() : '';
                const dist = parseInt(entry.maxDistance, 10);
                if (sId && Number.isInteger(dist) && dist >= 0 && state.students.some(s => s.id === sId)) {
                  const capped = Math.min(dist, clampGridDimension(state.gridRows));
                  const normalized = capped <= 0 ? 2 : capped;
                  restored[sId] = normalized;
                }
              }
            });
            state.conditions.teacherDistances = restored;
            state.conditions.genderAlternation = state.students.some(student => genderCode(student));
            const incomingMergeSettings = data.mergeSettings && typeof data.mergeSettings === 'object'
              ? data.mergeSettings
              : {};
            let mergeToggleValue = normalizeMergeToggleValue(
              typeof incomingMergeSettings.toggleValue === 'string' ? incomingMergeSettings.toggleValue : null
            );
            if (!incomingMergeSettings.toggleValue) {
              if (incomingMergeSettings.mode === 'forbid') {
                mergeToggleValue = 'nicht-zulässig';
              } else if (incomingMergeSettings.symbolsHidden) {
                mergeToggleValue = 'both';
              }
            }
            state.mergeToggleValue = mergeToggleValue;
            state.mergeMode = mergeToggleValue === 'nicht-zulässig' ? 'forbid' : 'allow';
            state.mergeSymbolsHidden = mergeToggleValue === 'both';
            if (state.mergeMode === 'forbid') {
              state.mergedPairs = new Set();
            }
            const incomingSeatScoresHidden = (data?.ui && typeof data.ui === 'object')
              ? data.ui.seatScoresHidden
              : data.seatScoresHidden;
            state.seatScoresHidden = Boolean(incomingSeatScoresHidden);
            enforceGridBounds();
            buildGrid();
            applySeatScoreVisibility();
            syncSeatScoreToggleButton();
            refreshUnseated();
            setMergeModeFromToggle(state.mergeToggleValue);
          }

          async function importPlanFromFile(file, handle) {
            if (!file) return;
            const rawText = await file.text();
            const text = stripJsonWarning(rawText);
            let data;
            try {
              data = JSON.parse(text);
            } catch (err) {
              throw new Error('Datei ist kein gültiges JSON.');
            }
            if (handle) {
              state.lastDirectoryHandle = handle;
            }
            applyPlanData(data);
          }

          function dataTransferHasFiles(dt) {
            if (!dt) return false;
            if (dt.files && dt.files.length > 0) return true;
            const types = dt.types;
            if (!types) return false;
            if (typeof types.includes === 'function') return types.includes('Files');
            if (typeof types.contains === 'function') return types.contains('Files');
            return Array.from(types).includes('Files');
          }

          function isCsvFile(file) {
            if (!file) return false;
            const name = String(file.name || '').toLowerCase();
            const type = String(file.type || '').toLowerCase();
            return name.endsWith('.csv')
              || type.includes('text/csv')
              || type.includes('application/csv')
              || type.includes('application/vnd.ms-excel');
          }

          function isJsonFile(file) {
            if (!file) return false;
            const name = String(file.name || '').toLowerCase();
            const type = String(file.type || '').toLowerCase();
            return name.endsWith('.json')
              || type.includes('application/json')
              || type.includes('text/json');
          }

          async function importCsvFromFile(file) {
            if (!file) return;
            if (els.csvStatus) {
              els.csvStatus.textContent = file.name;
            }
            const text = await file.text();
            let rows = parseCSV(text);
            if (!rows.length) {
              showMessage('Keine Daten gefunden.', 'warn');
              return;
            }
            const isSeparatorRow = (row) => {
              if (!Array.isArray(row)) return false;
              const normalized = row
                .map(val => String(val ?? '').trim())
                .join('')
                .toLowerCase();
              return /^sep\s*=/.test(normalized);
            };
            rows = rows.filter(row => !isSeparatorRow(row));
            if (!rows.length) {
              showMessage('Keine Daten gefunden.', 'warn');
              return;
            }
            state.csvName = extractPlanLabelFromRows(rows) || '';
            const firstNonEmptyIdx = rows.findIndex(r => Array.isArray(r) && r.some(x => String(x || '').trim() !== ''));
            if (firstNonEmptyIdx === -1) {
              showMessage('Nur leere Zeilen gefunden.', 'warn');
              return;
            }
            const headers = rows[firstNonEmptyIdx] || [];
            const dataStartIdx = firstNonEmptyIdx + 1;
            const dataRows = rows.slice(dataStartIdx);
            state.headers = headers;
            state.students = readStudents(dataRows);
            state.seats = {};
            state.conditions.teacherDistances = {};
            state.conditions.genderAlternation = state.students.some(student => genderCode(student));
            refreshUnseated();
            renderSeats();
            publishStudentsUpdatedFromSeatplan();
          }

          function createStudentNode(s) {
            const tpl = document.querySelector('body > template#student-tpl') || document.getElementById('student-tpl');
            if (!tpl || !tpl.content || !tpl.content.firstElementChild) {
              const fallback = document.createElement('div');
              fallback.className = 'student';
              fallback.dataset.sid = s.id;
              fallback.textContent = displayName(s);
              return fallback;
            }
            const node = tpl.content.firstElementChild.cloneNode(true);
            node.dataset.sid = s.id;
            node.querySelector('.name').textContent = displayName(s);
            node.querySelector('.tag')?.remove();
            addDragHandlers(node);
            enableTouchDragSource(node, () => {
              return {
                type: 'assignment',
                studentId: s.id,
                fromSeat: null,
                label: displayName(s) || s.id
              };
            });
            return node;
          }

          function refreshUnseated() {
            if (!els.unseated) return;
            els.unseated.innerHTML = '';
            const seatedIds = new Set(Object.values(state.seats).filter(Boolean));
            const unassigned = state.students
              .filter(s => !seatedIds.has(s.id))
              .slice()
              .sort((a, b) => formatStudentLabel(a).localeCompare(formatStudentLabel(b), 'de'));
            unassigned.forEach(s => {
              els.unseated.appendChild(createStudentNode(s));
            });
            const teacherSeated = Object.values(state.seats).some(v => v === 'TEACHER');
            if (els.teacherCard) {
              els.teacherCard.style.display = teacherSeated ? 'none' : '';
              els.teacherCard.dataset.sid = 'TEACHER';
              addDragHandlers(els.teacherCard);
              enableTouchDragSource(els.teacherCard, () => ({
                type: 'assignment',
                studentId: 'TEACHER',
                fromSeat: null,
                label: 'Lehrkraft'
              }));
            }
            updateScrollHint();
          }

          async function pickPlanFileWithPicker() {
            const canPick = typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
            if (!canPick) return { supported: false };
            try {
              const [handle] = await window.showOpenFilePicker({
                multiple: false,
                startIn: state.lastDirectoryHandle || 'downloads',
                types: [{
                  description: 'Sitzplan JSON',
                  accept: { 'application/json': ['.json'] }
                }],
                excludeAcceptAllOption: true,
              });
              if (!handle) return { supported: true, aborted: true };
              const file = await handle.getFile();
              if (!file) return { supported: true, aborted: true };
              return { supported: true, file, handle };
            } catch (err) {
              if (err && err.name === 'AbortError') {
                return { supported: true, aborted: true };
              }
              console.warn('showOpenFilePicker fehlgeschlagen, fallback auf klassische Datei-Auswahl', err);
              return { supported: true, aborted: true };
            }
          }

          function applySeatPattern(ids, label) {
            const unique = Array.from(new Set((ids || []).filter(Boolean)));
            if (!unique.length) {
              showMessage(
                label ? `Es konnten keine Plätze für das Muster ${label} aktiviert werden.` : 'Es konnten keine Plätze aktiviert werden.',
                'warn'
              );
              return;
            }
            state.activeSeats = new Set(unique);
            state.mergedPairs = new Set();
            const nextSeats = {};
            unique.forEach(id => {
              nextSeats[id] = Object.prototype.hasOwnProperty.call(state.seats, id) ? state.seats[id] : null;
            });
            state.seats = nextSeats;
            buildGrid();
            refreshUnseated();
          }

          function activatePiPattern() {
            if (!state.students.length) {
              showMessage('Importiere zuerst die Namensliste!', 'warn');
              return;
            }
            if (!state.gridRows || !state.gridCols) {
              showMessage('Das Raster enthält keine Plätze.', 'warn');
              return;
            }
            const n = Math.max(1, Math.ceil(state.students.length * 0.333) + 1);
            if (state.gridRows < n) { state.gridRows = clampGridDimension(n); }
            if (state.gridCols < n) { state.gridCols = clampGridDimension(n); }
            const maxCols = state.gridCols;
            const maxRows = state.gridRows;
            const ids = [];
            const seen = new Set();
            const pushSeat = (row, col) => {
              if (row < 1 || row > maxRows || col < 1 || col > maxCols) return false;
              const id = seatId(row, col);
              if (seen.has(id)) return false;
              seen.add(id);
              ids.push(id);
              return ids.length < n;
            };
            for (let c = 1; c <= n; c++) {
              pushSeat(1, c);
            }
            for (let r = 1; r <= n; r++) {
              pushSeat(r, 1);
            }
            for (let r = 1; r <= n; r++) {
              pushSeat(r, n);
            }
            applySeatPattern(ids, '∏');
          }

          function activateEPattern() {
            if (!state.students.length) {
              showMessage('Importiere zuerst die Namensliste!', 'warn');
              return;
            }
            const count = state.students.length;
            const ensureGridSize = size => {
              const target = clampGridDimension(size);
              if (state.gridRows < target) state.gridRows = target;
              if (state.gridCols < target) state.gridCols = target;
            };
            const coords = [];
            const push = (r, c) => coords.push(seatId(r, c));
            const addBase = () => {
              ensureGridSize(7);
              push(1, 1); push(1, 2); push(1, 3); push(1, 5); push(1, 6); push(1, 7);
              push(2, 1); push(2, 7);
              push(3, 1); push(3, 2); push(3, 3); push(3, 5); push(3, 6); push(3, 7);
              push(4, 1); push(4, 7);
              push(5, 1); push(5, 2); push(5, 3); push(5, 5); push(5, 6); push(5, 7);
            };
            const addMid = () => {
              ensureGridSize(7);
              push(6, 1); push(6, 7);
              push(7, 1); push(7, 2); push(7, 3); push(7, 5); push(7, 6); push(7, 7);
            };
            const addLarge = () => {
              ensureGridSize(9);
              push(8, 1); push(8, 7);
              push(9, 1); push(9, 2); push(9, 3); push(9, 5); push(9, 6); push(9, 7);
            };
            addBase();
            if (count > 22 && count <= 30) {
              addMid();
            } else if (count > 30) {
              addMid();
              addLarge();
            }
            applySeatPattern(coords, 'E');
          }

          function activateBars3Pattern() {
            if (!state.students.length) {
              showMessage('Importiere zuerst die Namensliste!', 'warn');
              return;
            }
            const n = Math.max(1, Math.ceil(state.students.length * 0.333));
            if (state.gridCols < n) { state.gridCols = clampGridDimension(n); }
            const ids = [];
            const rows = [1, 3, 5];
            rows.forEach(row => {
              if (state.gridRows < row) state.gridRows = clampGridDimension(row);
              const usableCols = Math.min(n, state.gridCols);
              for (let c = 1; c <= usableCols; c++) {
                ids.push(seatId(row, c));
              }
            }
            );
            applySeatPattern(ids, '☰');
          }

          function activateBars4Pattern() {
            if (!state.students.length) {
              showMessage('Importiere zuerst die Namensliste!', 'warn');
              return;
            }
            const n = Math.max(1, Math.ceil(state.students.length * 0.25));
            if (state.gridCols < n) { state.gridCols = clampGridDimension(n); }
            const rows = [1, 3, 5, 7];
            const ids = [];
            rows.forEach(row => {
              if (state.gridRows < row) state.gridRows = clampGridDimension(row);
              const usableCols = Math.min(n, state.gridCols);
              for (let c = 1; c <= usableCols; c++) {
                ids.push(seatId(row, c));
              }
            });
            applySeatPattern(ids, '≣');
          }

          function activateBars3GangPattern() {
            if (!state.students.length) {
              showMessage('Importiere zuerst die Namensliste!', 'warn');
              return;
            }
            const n = Math.max(1, Math.ceil(state.students.length * 0.333));
            const gapCol = Math.max(1, Math.ceil(n / 2));
            const requiredCols = Math.max(n + 1, gapCol);
            if (state.gridCols < requiredCols) { state.gridCols = clampGridDimension(requiredCols); }
            const rows = [1, 3, 5];
            const ids = [];
            const maxCols = state.gridCols;
            rows.forEach(row => {
              if (state.gridRows < row) state.gridRows = clampGridDimension(row);
              const usableCols = Math.min(n, maxCols);
              for (let c = 1; c <= usableCols; c++) {
                if (c === gapCol) continue;
                ids.push(seatId(row, c));
              }
              if (n + 1 <= maxCols) {
                ids.push(seatId(row, n + 1));
              }
            });
            applySeatPattern(ids, '☰ ☰');
          }

          function activateBars4GangPattern() {
            if (!state.students.length) {
              showMessage('Importiere zuerst die Namensliste!', 'warn');
              return;
            }
            const n = Math.max(1, Math.ceil(state.students.length * 0.25));
            const gapCol = Math.max(1, Math.ceil(n / 2));
            const requiredCols = Math.max(n + 1, gapCol);
            if (state.gridCols < requiredCols) { state.gridCols = clampGridDimension(requiredCols); }
            const rows = [1, 3, 5, 7];
            const ids = [];
            const maxCols = state.gridCols;
            rows.forEach(row => {
              if (state.gridRows < row) state.gridRows = clampGridDimension(row);
              const usableCols = Math.min(n, maxCols);
              for (let c = 1; c <= usableCols; c++) {
                if (c === gapCol) continue;
                ids.push(seatId(row, c));
              }
              if (n + 1 <= maxCols) {
                ids.push(seatId(row, n + 1));
              }
            });
            applySeatPattern(ids, '≣ ≣');
          }

          function applyGridDimensions(rows, cols) {
            const normalizedRows = normalizeGridDimension(rows);
            const normalizedCols = normalizeGridDimension(cols);
            if (normalizedRows === null || normalizedCols === null) {
              throw new Error('Ungültige Rastergröße.');
            }
            state.gridRows = normalizedRows;
            state.gridCols = normalizedCols;
            const active = new Set();
            state.activeSeats.forEach(id => {
              if (isSeatWithinBounds(id, normalizedRows, normalizedCols)) active.add(id);
            });
            state.activeSeats = active;
            const nextSeats = {};
            Object.keys(state.seats).forEach(id => {
              if (isSeatWithinBounds(id, normalizedRows, normalizedCols)) {
                nextSeats[id] = state.seats[id];
              }
            });
            state.seats = nextSeats;
            buildGrid();
            refreshUnseated();
          }

          function minimizeGridToActiveBounds() {
            if (!state.activeSeats.size) {
              showMessage('Keine aktiven Sitzplätze zum Minimieren.', 'warn');
              return;
            }
            const coords = [];
            state.activeSeats.forEach(id => {
              const [rStr, cStr] = id.split('-');
              const r = parseInt(rStr, 10);
              const c = parseInt(cStr, 10);
              if (Number.isFinite(r) && Number.isFinite(c)) {
                coords.push({ id, r, c });
              }
            });
            if (!coords.length) {
              showMessage('Keine gültigen Sitzplatzkoordinaten gefunden.', 'warn');
              return;
            }
            let minRow = Infinity;
            let maxRow = -Infinity;
            let minCol = Infinity;
            let maxCol = -Infinity;
            coords.forEach(({ r, c }) => {
              if (r < minRow) minRow = r;
              if (r > maxRow) maxRow = r;
              if (c < minCol) minCol = c;
              if (c > maxCol) maxCol = c;
            });
            const newRows = Math.max(1, maxRow - minRow + 1);
            const newCols = Math.max(1, maxCol - minCol + 1);
            const rowShift = minRow - 1;
            const colShift = minCol - 1;
            const remapId = (id) => {
              if (typeof id !== 'string') return null;
              const [rStr, cStr] = id.split('-');
              const r = parseInt(rStr, 10);
              const c = parseInt(cStr, 10);
              if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
              if (r < minRow || r > maxRow || c < minCol || c > maxCol) return null;
              const newR = r - rowShift;
              const newC = c - colShift;
              if (newR < 1 || newC < 1) return null;
              return seatId(newR, newC);
            };
            const remapSet = (set) => {
              const next = new Set();
              set.forEach(id => {
                const remapped = remapId(id);
                if (remapped) next.add(remapped);
              });
              return next;
            };
            const remappedSeats = {};
            Object.entries(state.seats).forEach(([id, val]) => {
              const remapped = remapId(id);
              if (remapped) remappedSeats[remapped] = val ?? null;
            });
            state.gridRows = clampGridDimension(newRows);
            state.gridCols = clampGridDimension(newCols);
            state.activeSeats = remapSet(state.activeSeats);
            state.seats = remappedSeats;
            state.dragSourceSeat = null;
            state.dragPayloadType = null;
            if (els.gridDialogRows) els.gridDialogRows.value = state.gridRows;
            if (els.gridDialogCols) els.gridDialogCols.value = state.gridCols;
            buildGrid();
            refreshUnseated();
          }

          function showGridDialog() {
            if (!els.gridDialog) return;
            if (els.gridDialogRows) els.gridDialogRows.value = state.gridRows;
            if (els.gridDialogCols) els.gridDialogCols.value = state.gridCols;
            if (typeof els.gridDialog.showModal === 'function') {
              if (!els.gridDialog.open) els.gridDialog.showModal();
            } else {
              els.gridDialog.setAttribute('open', 'open');
            }
            const focusDialog = () => {
              if (els.gridDialog) els.gridDialog.focus({ preventScroll: true });
            };
            if (typeof queueMicrotask === 'function') { queueMicrotask(focusDialog); }
            else { setTimeout(focusDialog, 0); }
          }

          function closeGridDialog() {
            if (!els.gridDialog) return;
            if (typeof els.gridDialog.close === 'function') {
              if (els.gridDialog.open) els.gridDialog.close();
            }
            els.gridDialog.removeAttribute('open');
          }

          function openCriteriaDialog() {
            if (!els.criteriaDialog) return;
            if (typeof els.criteriaDialog.showModal === 'function') {
              if (!els.criteriaDialog.open) els.criteriaDialog.showModal();
            } else {
              els.criteriaDialog.setAttribute('open', 'open');
            }
            const focusDialog = () => {
              if (els.criteriaDialog) els.criteriaDialog.focus({ preventScroll: true });
            };
            if (typeof queueMicrotask === 'function') { queueMicrotask(focusDialog); }
            else { setTimeout(focusDialog, 0); }
          }

          function closeCriteriaDialog() {
            if (!els.criteriaDialog) return;
            if (typeof els.criteriaDialog.close === 'function') {
              if (els.criteriaDialog.open) els.criteriaDialog.close();
            }
            els.criteriaDialog.removeAttribute('open');
          }

          function openSummaryDialog() {
            if (!els.summaryDialog) return;
            buildSummaryTable();
            syncSeatScoreToggleButton();
            if (typeof els.summaryDialog.showModal === 'function') {
              if (!els.summaryDialog.open) els.summaryDialog.showModal();
            } else {
              els.summaryDialog.setAttribute('open', 'open');
            }
            const focusDialog = () => {
              if (els.summaryDialog) els.summaryDialog.focus({ preventScroll: true });
            };
            if (typeof queueMicrotask === 'function') { queueMicrotask(focusDialog); }
            else { setTimeout(focusDialog, 0); }
          }

          function closeSummaryDialog() {
            if (!els.summaryDialog) return;
            if (typeof els.summaryDialog.close === 'function') {
              if (els.summaryDialog.open) els.summaryDialog.close();
            }
            els.summaryDialog.removeAttribute('open');
          }

          function requiredDimensionForGrid(cellSize, cells) {
            const safeCells = Math.max(1, Math.min(MAX_GRID_SIZE, Math.round(Number(cells) || 0) || 1));
            const gap = GRID_LAYOUT_DEFAULTS.gap;
            const padding = GRID_LAYOUT_DEFAULTS.padding;
            const between = Math.max(0, safeCells - 1) * gap;
            return (safeCells * cellSize) + between + (padding * 2);
          }

          function shouldUseCompactGrid() {
            if (!els.gridWrap) return false;
            const { clientWidth, clientHeight } = els.gridWrap;
            if (clientWidth <= 0 || clientHeight <= 0) return false;
            const cols = Math.max(1, Math.min(MAX_GRID_SIZE, Number(state.gridCols) || MIN_VISIBLE_GRID_DIMENSION));
            const rows = Math.max(1, Math.min(MAX_GRID_SIZE, Number(state.gridRows) || MIN_VISIBLE_GRID_DIMENSION));
            const requiresWidth = requiredDimensionForGrid(GRID_LAYOUT_DEFAULTS.seatWidth, cols);
            const requiresHeight = requiredDimensionForGrid(GRID_LAYOUT_DEFAULTS.seatHeight, rows);
            return clientWidth < requiresWidth || clientHeight < requiresHeight;
          }

          function currentGridGap() {
            if (!els.grid || typeof getComputedStyle !== 'function') return GRID_LAYOUT_DEFAULTS.gap;
            const style = getComputedStyle(els.grid);
            const gapStr = (style.gap || style.columnGap || `${GRID_LAYOUT_DEFAULTS.gap}px`);
            const first = gapStr.split(' ')[0];
            const val = parseFloat(first);
            return Number.isFinite(val) ? val : GRID_LAYOUT_DEFAULTS.gap;
          }

          function parsePx(value, fallback = 0) {
            const num = parseFloat(value);
            return Number.isFinite(num) ? num : fallback;
          }

          function isSeatplanCollapsedViewport() {
            const hostApp = els.gridWrap?.closest('.app');
            return Boolean(
              hostApp?.classList.contains('app-tab-seatplan')
              && (
                hostApp.classList.contains('is-collapsing')
                || hostApp.classList.contains('chrome-collapsed')
              )
            );
          }

          function getElementPaddingSize(element) {
            if (!element || typeof getComputedStyle !== 'function') {
              return { x: 0, y: 0 };
            }
            const style = getComputedStyle(element);
            return {
              x: parsePx(style.paddingLeft) + parsePx(style.paddingRight),
              y: parsePx(style.paddingTop) + parsePx(style.paddingBottom),
            };
          }

          function getElementContentBoxSize(element) {
            if (!element) return { width: 0, height: 0 };
            const rect = element.getBoundingClientRect();
            const padding = getElementPaddingSize(element);
            return {
              width: Math.max(0, Math.round(Math.max(element.clientWidth - padding.x, rect.width - padding.x))),
              height: Math.max(0, Math.round(Math.max(element.clientHeight - padding.y, rect.height - padding.y))),
            };
          }

          function pickViewportDimension(candidates) {
            const sizes = candidates
              .map((value) => Math.max(0, Math.round(Number(value) || 0)));
            for (let index = 0; index < sizes.length; index += 1) {
              const candidate = sizes[index];
              const maxRemaining = Math.max(0, ...sizes.slice(index + 1));
              if (candidate > 40 && (maxRemaining <= 80 || candidate >= maxRemaining * 0.55)) {
                return candidate;
              }
            }
            return Math.max(0, ...sizes);
          }

          function rememberStableSeatplanViewportSize(size) {
            if (!size) return;
            const width = Math.max(0, Math.round(Number(size.width) || 0));
            const height = Math.max(0, Math.round(Number(size.height) || 0));
            if (width <= 80 || height <= 80) return;
            getGridWrapViewportSize._lastStable = { width, height };
          }

          function getGridWrapViewportSize() {
            if (!els.gridWrap) return { width: 0, height: 0 };
            let width = els.gridWrap.clientWidth;
            let height = els.gridWrap.clientHeight;
            const wrapRect = els.gridWrap.getBoundingClientRect();
            const host = els.gridWrap.closest('#seatplan-main-host');
            const main = els.gridWrap.closest('.main');
            const seatplanCollapsed = isSeatplanCollapsedViewport();
            width = Math.max(width, Math.round(wrapRect.width));
            height = Math.max(height, Math.round(wrapRect.height));
            if (seatplanCollapsed) {
              const hostPadding = getElementPaddingSize(host);
              const mainSize = getElementContentBoxSize(main);
              const hostSize = getElementContentBoxSize(host);
              const visualViewportWidth = typeof window !== 'undefined'
                ? Math.max(
                  0,
                  Math.round(
                    ((window.visualViewport?.width ?? window.innerWidth ?? 0) || 0) - hostPadding.x
                  )
                )
                : 0;
              const visualViewportHeight = typeof window !== 'undefined'
                ? Math.max(
                  0,
                  Math.round(window.visualViewport?.height ?? window.innerHeight ?? 0)
                )
                : 0;
              const measured = {
                width: pickViewportDimension([
                  mainSize.width,
                  hostSize.width,
                  visualViewportWidth,
                  width,
                ]),
                height: pickViewportDimension([
                  mainSize.height,
                  hostSize.height,
                  visualViewportHeight,
                  height,
                ]),
              };
              const lastStable = getGridWrapViewportSize._lastStable || null;
              if (lastStable) {
                const unstableWidth = measured.width <= 80 && lastStable.width > 120;
                const unstableHeight = measured.height <= 80 && lastStable.height > 120;
                if (unstableWidth) measured.width = lastStable.width;
                if (unstableHeight) measured.height = lastStable.height;
              }
              rememberStableSeatplanViewportSize(measured);
              return measured;
            }
            if (width > 40 && height > 40) {
              const measured = { width, height };
              rememberStableSeatplanViewportSize(measured);
              return measured;
            }
            if (main) {
              const mainRect = main.getBoundingClientRect();
              width = Math.max(width, Math.round(mainRect.width));
              const topOffset = Math.max(0, wrapRect.top - mainRect.top);
              height = Math.max(height, Math.round(mainRect.height - topOffset));
            }
            if (host) {
              const hostRect = host.getBoundingClientRect();
              width = Math.max(width, Math.round(hostRect.width));
              height = Math.max(height, Math.round(hostRect.height));
            }
            const measured = { width, height };
            rememberStableSeatplanViewportSize(measured);
            return measured;
          }

          function updateGridAutoScale() {
            if (!els.grid || !els.gridWrap || typeof getComputedStyle !== 'function') return;
            const seatplanCollapsed = isSeatplanCollapsedViewport();
            const { width: wrapWidth, height: wrapHeight } = getGridWrapViewportSize();
            if (wrapWidth <= 40 || wrapHeight <= 40) {
              const lastStableScale = updateGridAutoScale._lastStableScale || null;
              if (seatplanCollapsed && lastStableScale) {
                els.grid.style.setProperty('--seatplan-fit-scale-x', String(lastStableScale.x));
                els.grid.style.setProperty('--seatplan-fit-scale-y', String(lastStableScale.y));
                els.grid.style.setProperty('--seatplan-fit-scale-gap', String(lastStableScale.gap));
                els.grid.style.setProperty('--seatplan-fit-scale-font', String(lastStableScale.font));
              } else if (!seatplanCollapsed) {
                els.grid.style.setProperty('--seatplan-fit-scale-x', '1');
                els.grid.style.setProperty('--seatplan-fit-scale-y', '1');
                els.grid.style.setProperty('--seatplan-fit-scale-gap', '1');
                els.grid.style.setProperty('--seatplan-fit-scale-font', '1');
              }
              if (typeof window !== 'undefined') {
                if (updateGridAutoScale._retryTimer) {
                  window.clearTimeout(updateGridAutoScale._retryTimer);
                }
                updateGridAutoScale._retryTimer = window.setTimeout(() => {
                  updateGridAutoScale._retryTimer = 0;
                  updateGridAutoScale();
                }, seatplanCollapsed ? 120 : 90);
              }
              return;
            }
            if (typeof window !== 'undefined' && updateGridAutoScale._retryTimer) {
              window.clearTimeout(updateGridAutoScale._retryTimer);
              updateGridAutoScale._retryTimer = 0;
            }

            const gridStyle = getComputedStyle(els.grid);
            const cols = Math.max(1, Number(state.gridCols) || 1);
            const rows = Math.max(1, Number(state.gridRows) || 1);
            const baseSeatWidth = parsePx(gridStyle.getPropertyValue('--seat-base-min-width'), GRID_LAYOUT_DEFAULTS.seatWidth);
            const baseSeatHeight = parsePx(gridStyle.getPropertyValue('--seat-base-min-height'), GRID_LAYOUT_DEFAULTS.seatHeight);
            const baseGap = parsePx(gridStyle.getPropertyValue('--seat-base-gap'), GRID_LAYOUT_DEFAULTS.gap);
            const minScale = seatplanCollapsed ? 0.18 : 0.06;
            const maxScaleX = 6;
            const maxScaleY = 2;
            const previousStableScale = updateGridAutoScale._lastStableScale || null;
            const fitReserveWidth = isIOSDevice ? 12 : 2;
            const fitReserveHeight = isIOSDevice ? 16 : 6;
            const safeWrapWidth = Math.max(1, wrapWidth - fitReserveWidth);
            const safeWrapHeight = Math.max(1, wrapHeight - fitReserveHeight);

            const setScaleVars = (scaleX, scaleY) => {
              const safeX = Math.max(minScale, Math.min(maxScaleX, scaleX));
              const safeY = Math.max(minScale, Math.min(maxScaleY, scaleY));
              const fontScale = Math.max(minScale, Math.min(safeX, safeY));
              els.grid.style.setProperty('--seatplan-fit-scale-x', String(safeX));
              els.grid.style.setProperty('--seatplan-fit-scale-y', String(safeY));
              els.grid.style.setProperty('--seatplan-fit-scale-gap', String(safeY));
              els.grid.style.setProperty('--seatplan-fit-scale-font', String(fontScale));
              updateGridAutoScale._lastStableScale = {
                x: safeX,
                y: safeY,
                gap: safeY,
                font: fontScale,
              };
              return { safeX, safeY };
            };
            const measureGridFit = () => {
              const wrapRect = els.gridWrap.getBoundingClientRect();
              const gridRect = els.grid.getBoundingClientRect();
              const contentWidth = Math.max(els.grid.scrollWidth, els.grid.offsetWidth, gridRect.width, 1);
              const contentHeight = Math.max(els.grid.scrollHeight, els.grid.offsetHeight, gridRect.height, 1);
              const scrollOverflowX = Math.max(0, els.grid.scrollWidth - safeWrapWidth);
              const scrollOverflowY = Math.max(0, els.grid.scrollHeight - safeWrapHeight);
              const rectOverflowX = Math.max(0, gridRect.right - wrapRect.right, wrapRect.left - gridRect.left);
              const rectOverflowY = Math.max(0, gridRect.bottom - wrapRect.bottom, wrapRect.top - gridRect.top);
              const overflowX = Math.max(scrollOverflowX, rectOverflowX);
              const overflowY = Math.max(scrollOverflowY, rectOverflowY);
              return { contentWidth, contentHeight, overflowX, overflowY };
            };

            const verticalGapUnits = Math.max(0, rows - 1) + 2;
            const horizontalGapUnits = Math.max(0, cols - 1) + 2;
            const heightDenominator = (rows * baseSeatHeight) + (verticalGapUnits * baseGap);
            let fitScaleY = Math.max(minScale, Math.min(maxScaleY, safeWrapHeight / Math.max(1, heightDenominator)));

            const scaledGap = baseGap * fitScaleY;
            const horizontalGapSpace = horizontalGapUnits * scaledGap;
            const seatWidthSpace = Math.max(1, safeWrapWidth - horizontalGapSpace);
            const widthDenominator = cols * baseSeatWidth;
            let fitScaleX = Math.max(minScale, Math.min(maxScaleX, seatWidthSpace / Math.max(1, widthDenominator)));

            if (isIOSDevice) {
              const widthDenominatorWithGap = (cols * baseSeatWidth) + (horizontalGapUnits * baseGap);
              const heightDenominatorWithGap = (rows * baseSeatHeight) + (verticalGapUnits * baseGap);
              let uniformScale = Math.max(
                minScale,
                Math.min(
                  maxScaleY,
                  safeWrapWidth / Math.max(1, widthDenominatorWithGap),
                  safeWrapHeight / Math.max(1, heightDenominatorWithGap)
                )
              );
              const setUniformScale = (scale) => setScaleVars(scale, scale);
              for (let pass = 0; pass < 8; pass += 1) {
                const applied = setUniformScale(uniformScale);
                uniformScale = Math.min(applied.safeX, applied.safeY);
                const { contentWidth, contentHeight, overflowX, overflowY } = measureGridFit();
                if (overflowX <= 0.2 && overflowY <= 0.2) break;
                const shrink = Math.min(
                  (safeWrapWidth - 1) / Math.max(1, contentWidth),
                  (safeWrapHeight - 1) / Math.max(1, contentHeight),
                  0.995
                );
                uniformScale = Math.max(minScale, uniformScale * shrink);
              }
              setUniformScale(uniformScale);
              return;
            }

            for (let pass = 0; pass < 7; pass += 1) {
              const initial = setScaleVars(fitScaleX, fitScaleY);
              fitScaleX = initial.safeX;
              fitScaleY = initial.safeY;
              const { contentWidth, contentHeight, overflowX, overflowY } = measureGridFit();

              if (overflowX > 0.2) {
                fitScaleX = Math.max(minScale, fitScaleX * (safeWrapWidth / Math.max(1, contentWidth)) * 0.995);
              } else if (contentWidth < safeWrapWidth * 0.94) {
                fitScaleX = Math.min(maxScaleX, fitScaleX * (safeWrapWidth / Math.max(1, contentWidth)));
              }

              if (overflowY > 0.2) {
                fitScaleY = Math.max(minScale, fitScaleY * (safeWrapHeight / Math.max(1, contentHeight)) * 0.995);
              }

              setScaleVars(fitScaleX, fitScaleY);
              if (overflowX <= 0.2 && overflowY <= 0.2) break;
            }
            for (let pass = 0; pass < 3; pass += 1) {
              const { overflowX, overflowY } = measureGridFit();
              if (overflowX <= 0.2 && overflowY <= 0.2) break;
              if (overflowX > 0.2) {
                fitScaleX = Math.max(minScale, fitScaleX * (safeWrapWidth / Math.max(1, safeWrapWidth + overflowX)) * 0.995);
              }
              if (overflowY > 0.2) {
                fitScaleY = Math.max(minScale, fitScaleY * (safeWrapHeight / Math.max(1, safeWrapHeight + overflowY)) * 0.995);
              }
              setScaleVars(fitScaleX, fitScaleY);
            }
            if (seatplanCollapsed) {
              if (previousStableScale && (fitScaleX <= 0.185 || fitScaleY <= 0.185)) {
                const fallbackX = Math.max(minScale, previousStableScale.x);
                const fallbackY = Math.max(minScale, previousStableScale.y);
                const fallbackGap = Math.max(minScale, previousStableScale.gap);
                const fallbackFont = Math.max(minScale, previousStableScale.font);
                els.grid.style.setProperty('--seatplan-fit-scale-x', String(fallbackX));
                els.grid.style.setProperty('--seatplan-fit-scale-y', String(fallbackY));
                els.grid.style.setProperty('--seatplan-fit-scale-gap', String(fallbackGap));
                els.grid.style.setProperty('--seatplan-fit-scale-font', String(fallbackFont));
                updateGridAutoScale._lastStableScale = {
                  x: fallbackX,
                  y: fallbackY,
                  gap: fallbackGap,
                  font: fallbackFont,
                };
              }
            }
          }

          function updateGridViewportMode() {
            if (!els.grid) return;
            const compact = shouldUseCompactGrid();
            els.grid.classList.toggle('grid-compact', compact);
            updateGridAutoScale();
            renderSeatLinks();
          }

          function handleGridLinkClick(e) {
            const link = e.target.closest('.grid-link');
            if (!link) return;
            const aId = link.dataset.a;
            const bId = link.dataset.b;
            const merged = link.dataset.merged === '1';
            if (merged) {
              unmergePair(aId, bId);
            } else if (aId && bId) {
              triggerMergeAnimation(aId, bId);
            }
          }

          function ensureGridLinksLayer(clearContents = false) {
            if (!els.grid) return null;
            let layer = els.grid.querySelector('.grid-links-layer');
            if (!layer) {
              layer = document.createElement('div');
              layer.className = 'grid-links-layer';
              layer.setAttribute('aria-hidden', 'true');
              layer.addEventListener('click', handleGridLinkClick);
              els.grid.appendChild(layer);
            }
            if (clearContents) {
              layer.innerHTML = '';
            }
            return layer;
          }

          function ensureMergeLayer(clearContents = false) {
            if (!els.grid) return null;
            let layer = els.grid.querySelector('.grid-merge-layer');
            if (!layer) {
              layer = document.createElement('div');
              layer.className = 'grid-merge-layer';
              layer.setAttribute('aria-hidden', 'true');
              els.grid.appendChild(layer);
            }
            if (clearContents) {
              layer.innerHTML = '';
            }
            return layer;
          }

          function pairKey(a, b) {
            if (!a || !b) return null;
            return [a, b].sort().join('|');
          }

          function removeMergesInvolving(seatIds) {
            if (!state.mergedPairs || !seatIds || !seatIds.length) return;
            const blocked = new Set(seatIds.filter(Boolean));
            if (!blocked.size) return;
            const next = new Set();
            state.mergedPairs.forEach(key => {
              const [a, b] = (key || '').split('|');
              if (!blocked.has(a) && !blocked.has(b)) {
                next.add(key);
              }
            });
            state.mergedPairs = next;
          }

          function normalizeMergeToggleValue(value) {
            if (value === 'both' || value === 'nicht-zulässig' || value === 'zulässig') return value;
            return 'zulässig';
          }

          function syncMergeToggleUI(value) {
            const normalized = normalizeMergeToggleValue(value);
            const input = document.querySelector(`input[name="twoer-toggle"][value="${normalized}"]`);
            if (input) {
              input.checked = true;
            }
          }

          function applyMergeIconVisibility() {
            if (!els.grid) return;
            els.grid.classList.toggle('merge-icons-hidden', !!state.mergeSymbolsHidden);
          }

          function applySeatScoreVisibility() {
            if (!els.grid) return;
            const hideScores = !!state.seatScoresHidden || !hasAnyConfiguredPreference();
            els.grid.classList.toggle('seat-scores-hidden', hideScores);
          }

          function syncSeatScoreToggleButton() {
            if (!els.toggleSeatScores) return;
            const hidden = !!state.seatScoresHidden;
            els.toggleSeatScores.textContent = hidden ? 'Scores einblenden' : 'Scores ausblenden';
            els.toggleSeatScores.title = hidden ? 'Scores im Sitzplan anzeigen' : 'Scores im Sitzplan ausblenden';
          }

          function hasAnyConfiguredPreference() {
            if (getTeacherDistanceMap().size > 0) return true;
            if (!Array.isArray(state.students) || !state.students.length) return false;
            return state.students.some(student => {
              if (!student || typeof student !== 'object') return false;
              if (student.prefersAlone) return true;
              if (Array.isArray(student.buddies) && student.buddies.some(Boolean)) return true;
              if (Array.isArray(student.foes) && student.foes.some(Boolean)) return true;
              return typeof student.genderPref === 'string' && student.genderPref.trim() !== '';
            });
          }

          function applySidebarScoreVisibility() {
            if (!els.sidebarScore) return false;
            const visible = hasAnyConfiguredPreference();
            els.sidebarScore.hidden = false;
            els.sidebarScore.style.display = visible ? '' : 'none';
            if (!visible) {
              els.sidebarScore.setAttribute('aria-hidden', 'true');
              els.sidebarScore.setAttribute('tabindex', '-1');
            } else {
              els.sidebarScore.removeAttribute('aria-hidden');
              els.sidebarScore.setAttribute('tabindex', '0');
            }
            return visible;
          }

          function setMergeModeFromToggle(value) {
            const choice = normalizeMergeToggleValue(value);
            state.mergeToggleValue = choice;
            state.mergeMode = choice === 'nicht-zulässig' ? 'forbid' : 'allow';
            state.mergeSymbolsHidden = choice === 'both';
            if (state.mergeMode === 'forbid') {
              state.mergedPairs = new Set();
            }
            syncMergeToggleUI(choice);
            applyMergeIconVisibility();
            markOptimalScoreStale();
            updateGridAutoScale();
            renderSeatLinks();
          }

          function updateSidebarScore() {
            if (!els.sidebarScore) return;
            applySeatScoreVisibility();
            if (!applySidebarScoreVisibility()) {
              setSidebarScoreValue('Gesamtscore: –');
              els.sidebarScore.classList.remove('score-good', 'score-bad', 'score-neutral');
              els.sidebarScore.classList.add('score-neutral');
              state.lastSidebarScoreValue = null;
              updateSeatDiagnostics();
              return;
            }
            if (!state.activeSeats || !state.activeSeats.size) {
              setSidebarScoreValue('Gesamtscore: –');
              els.sidebarScore.classList.remove('score-good', 'score-bad', 'score-neutral');
              els.sidebarScore.classList.add('score-neutral');
              state.lastSidebarScoreValue = null;
              updateSeatDiagnostics();
              return;
            }
            const activeIds = Array.from(state.activeSeats);
            const activeSet = new Set(activeIds);
            const map = new Map();
            activeIds.forEach(id => { map.set(id, state.seats[id] || null); });
            const studentById = new Map((state.students || []).map(s => [s.id, s]));
            const mergedPairs = state.mergedPairs || new Set();
            const cost = countConflicts(map, activeSet, studentById, mergedPairs);
            if (!Number.isFinite(cost)) {
              setSidebarScoreValue('Gesamtscore: –');
              els.sidebarScore.classList.remove('score-good', 'score-bad', 'score-neutral');
              els.sidebarScore.classList.add('score-neutral');
              state.lastSidebarScoreValue = null;
              updateSeatDiagnostics();
              return;
            }
            const score = -cost;
            els.sidebarScore.classList.remove('score-good', 'score-bad', 'score-neutral');
            els.sidebarScore.classList.add(scoreClassForOptimal(score, state.optimalScore));
            const formatted = score.toFixed(1);
            setSidebarScoreValue(`Gesamtscore: ${formatted}`);
            state.lastSidebarScoreValue = score;
            updateSeatDiagnostics();
            if (state.optimalScoreStale && !state.optimalScorePending) {
              scheduleOptimalScoreRecalc('auto');
            }
          }

          function setSidebarScoreValue(text) {
            if (!els.sidebarScore) return;
            let valueEl = els.sidebarScore.querySelector('.sidebar-score-value');
            let subEl = els.sidebarScore.querySelector('.sidebar-score-sub');
            if (!valueEl) {
              els.sidebarScore.textContent = '';
              valueEl = document.createElement('span');
              valueEl.className = 'sidebar-score-value';
              els.sidebarScore.appendChild(valueEl);
            }
            if (subEl) {
              subEl.remove();
              subEl = null;
            }
            valueEl.textContent = text || 'Gesamtscore: –';
          }

          function formatScoreValue(score) {
            if (!Number.isFinite(score)) return '–';
            return (Math.abs(score - Math.round(score)) < 1e-9)
              ? String(Math.round(score))
              : score.toFixed(2);
          }

          function scoreClassForValue(score) {
            if (!Number.isFinite(score)) return 'score-neutral';
            if (score > 0.2) return 'score-good';
            if (score < -0.2) return 'score-bad';
            return 'score-neutral';
          }

          function scoreClassForOptimal(score, optimal) {
            if (!Number.isFinite(score) || !Number.isFinite(optimal)) return 'score-neutral';
            const denom = Math.max(1, Math.abs(optimal));
            const deviation = (optimal - score) / denom;
            if (deviation <= OPTIMAL_SCORE_THRESHOLDS.good) return 'score-good';
            if (deviation <= OPTIMAL_SCORE_THRESHOLDS.warn) return 'score-neutral';
            return 'score-bad';
          }

          function markOptimalScoreStale() {
            state.optimalScoreStale = true;
            state.optimalScoreVersion = (state.optimalScoreVersion || 0) + 1;
          }

          function scheduleOptimalScoreRecalc(reason = '') {
            if (!state.optimalScoreStale) return;
            if (optimalScoreTimer) {
              clearTimeout(optimalScoreTimer);
            }
            optimalScoreTimer = setTimeout(() => {
              optimalScoreTimer = null;
              recomputeOptimalScore(reason);
            }, 150);
          }

          function recomputeOptimalScore(reason = '') {
            if (!state.optimalScoreStale || state.optimalScorePending) return;
            if (!state.activeSeats || !state.activeSeats.size || !state.students.length) {
              state.optimalScore = null;
              state.optimalScoreStale = false;
              updateSidebarScore();
              return;
            }
            state.optimalScorePending = true;
            const version = state.optimalScoreVersion || 0;
            try {
              const activeIds = Array.from(state.activeSeats);
              const activeSet = new Set(activeIds);
              const map = new Map();
              activeIds.forEach(id => { map.set(id, state.seats[id] || null); });
              const studentById = new Map((state.students || []).map(s => [s.id, s]));
              if (!studentById.size) {
                state.optimalScore = null;
                state.optimalScoreStale = false;
                updateSidebarScore();
                return;
              }
              const lockedSeatIds = new Set();
              const teacherSeatId = [...map.entries()].find(([, val]) => val === 'TEACHER')?.[0] || null;
              if (teacherSeatId) lockedSeatIds.add(teacherSeatId);
              const res = improveSeatMapWithBestSwaps(map, activeIds, studentById, lockedSeatIds, {
                timeLimitMs: 200,
                maxPasses: 8,
              });
              const bestCost = Number.isFinite(res?.bestCost)
                ? res.bestCost
                : countConflicts(map, activeSet, studentById, state.mergedPairs || new Set());
              state.optimalScore = Number.isFinite(bestCost) ? -bestCost : null;
              if ((state.optimalScoreVersion || 0) === version) {
                state.optimalScoreStale = false;
                updateSidebarScore();
              } else {
                state.optimalScoreStale = true;
                scheduleOptimalScoreRecalc(reason || 'auto');
              }
            } finally {
              state.optimalScorePending = false;
            }
          }

          function formatNameList(list, limit = 3) {
            const names = Array.isArray(list) ? list.map(item => {
              if (!item) return '';
              if (typeof item === 'string') return item;
              return item.name || item.label || '';
            }).filter(Boolean) : [];
            if (!names.length) return '';
            if (names.length <= limit) return names.join(', ');
            const rest = names.length - limit;
            return `${names.slice(0, limit).join(', ')} (+${rest} weitere)`;
          }

          function scaledDistance34(value, dist) {
            if (!Number.isFinite(value)) return 0;
            if (dist === 3) return value;
            return 0;
          }

          function scaledBuddyDistance23(value, dist) {
            if (!Number.isFinite(value)) return 0;
            if (dist === 2) return value * 0.5;
            if (dist === 3) return value * 0.25;
            return 0;
          }

          function countInactiveOnSegment(r1, c1, r2, c2, activeHas) {
            if (!(activeHas && typeof activeHas.has === 'function')) return 0;
            if (r1 !== r2 && c1 !== c2) return Number.POSITIVE_INFINITY;
            const dr = Math.sign(r2 - r1);
            const dc = Math.sign(c2 - c1);
            let r = r1 + dr;
            let c = c1 + dc;
            let inactive = 0;
            while (r !== r2 || c !== c2) {
              if (!activeHas.has(seatId(r, c))) inactive += 1;
              r += dr;
              c += dc;
            }
            return inactive;
          }

          function minInactiveOnManhattanPath(a, b, activeHas) {
            if (!(a && b)) return 0;
            if (!(activeHas && typeof activeHas.has === 'function')) return 0;
            if (a.r === b.r) {
              return countInactiveOnSegment(a.r, a.c, b.r, b.c, activeHas);
            }
            if (a.c === b.c) {
              return countInactiveOnSegment(a.r, a.c, b.r, b.c, activeHas);
            }

            const c1Id = seatId(a.r, b.c);
            const path1Inactive = countInactiveOnSegment(a.r, a.c, a.r, b.c, activeHas)
              + countInactiveOnSegment(a.r, b.c, b.r, b.c, activeHas)
              + (activeHas.has(c1Id) ? 0 : 1);

            const c2Id = seatId(b.r, a.c);
            const path2Inactive = countInactiveOnSegment(a.r, a.c, b.r, a.c, activeHas)
              + countInactiveOnSegment(b.r, a.c, b.r, b.c, activeHas)
              + (activeHas.has(c2Id) ? 0 : 1);
            return Math.min(path1Inactive, path2Inactive);
          }

          function foeDistanceEffectFactor(a, b, activeHas) {
            const inactiveCount = minInactiveOnManhattanPath(a, b, activeHas);
            if (!Number.isFinite(inactiveCount) || inactiveCount >= 2) return 0;
            if (inactiveCount >= 1) return 0.5;
            return 1;
          }

          function computeSeatDiagnostics() {
            const bySeat = new Map();
            const byStudent = new Map();
            if (!state.activeSeats || !state.activeSeats.size) {
              return { bySeat, byStudent };
            }

            const activeIds = Array.from(state.activeSeats);
            const activeSet = new Set(activeIds);
            const studentById = new Map((state.students || []).map(s => [s.id, s]));
            const mergedPairs = state.mergedPairs || new Set();
            const teacherDistanceMap = getTeacherDistanceMap();
            const teacherDistanceWanted = new Set(Array.from(teacherDistanceMap.keys()));
            const genderAlternate = !!state.conditions?.genderAlternation;
            const cache = createConflictCache(activeSet, studentById, mergedPairs, {
              activeIds,
              genderAlternate,
              teacherDistanceMap,
              teacherDistanceWanted,
            });

            const seatMap = new Map();
            let teacherSeatId = null;
            activeIds.forEach(id => {
              const sid = state.seats[id] || null;
              seatMap.set(id, sid);
              if (sid === 'TEACHER') teacherSeatId = id;
            });

            const seatByStudent = new Map();
            const nameOf = (sid) => {
              const student = studentById.get(sid);
              if (student) return formatStudentLabel(student);
              return `ID ${sid || ''}`.trim();
            };

            seatMap.forEach((sid, seatId) => {
              if (!sid || sid === 'TEACHER') return;
              seatByStudent.set(sid, seatId);
              const student = studentById.get(sid);
              const diag = {
                studentId: sid,
                seatId,
                name: nameOf(sid),
                score: 0,
                front: { wants: false, status: 'neutral', dist: null, penalty: 0 },
                alone: { wants: !!student?.prefersAlone, neighbors: [] },
                neighbors: { foes: [], buddies: [], genderSame: [], genderChecked: 0 },
                buddyDistance: { near: [], mid: [] },
                foeDistance: { near: [], mid: [], far: [] },
                preferenceRows: [],
                hasBuddyPrefs: buddyCount(student) > 0,
                hasFoes: (cache.foeSetById.get(sid)?.size || 0) > 0,
              };
              byStudent.set(sid, diag);
              bySeat.set(seatId, diag);
            });

            const teacherCoords = teacherSeatId ? cache.seatCoords.get(teacherSeatId) : null;
            const teacherRowIdx = (teacherCoords && cache.rowIndex.has(teacherCoords.r))
              ? cache.rowIndex.get(teacherCoords.r)
              : null;

            byStudent.forEach(diag => {
              if (!teacherDistanceWanted.has(diag.studentId)) {
                diag.front = { wants: false, status: 'neutral', dist: null, penalty: 0 };
                return;
              }
              diag.front.wants = true;
              if (teacherRowIdx === null) {
                diag.front.status = 'warn';
                return;
              }
              const seatRowIdx = cache.seatRowIndex.get(diag.seatId);
              if (seatRowIdx === undefined) {
                diag.front.status = 'warn';
                return;
              }
              const dist = Math.abs(seatRowIdx - teacherRowIdx);
              diag.front.dist = dist;
              if (dist >= 3) {
                diag.front.status = 'bad';
                diag.front.penalty = 3;
              } else if (dist === 2) {
                diag.front.status = 'warn';
                diag.front.penalty = 1;
              } else {
                diag.front.status = 'ok';
                diag.front.penalty = 0;
              }
              diag.score += diag.front.penalty;
            });

            const genderPenalty = 1;
            const buddyBonusOneWay = BUDDY_ADJACENT_BONUS_ONE_WAY;
            const aloneNeighborPenalty = ALONE_NEIGHBOR_PENALTY;

            for (let i = 0; i < cache.adjacentPairs.length; i++) {
              const [aSeat, bSeat, mergeFactorRaw] = cache.adjacentPairs[i];
              const aId = seatMap.get(aSeat);
              const bId = seatMap.get(bSeat);
              if (!aId || !bId) continue;
              if (aId === 'TEACHER' || bId === 'TEACHER') continue;
              const diagA = byStudent.get(aId);
              const diagB = byStudent.get(bId);
              if (!diagA || !diagB) continue;
              const mergeFactor = Number.isFinite(mergeFactorRaw) ? mergeFactorRaw : 1;
              const alonePenalty = aloneNeighborPenalty * mergeFactor;
              if (diagA.alone?.wants) {
                diagA.alone.neighbors.push({ id: bId, name: diagB.name, mergeFactor });
                diagA.score += alonePenalty;
              }
              if (diagB.alone?.wants) {
                diagB.alone.neighbors.push({ id: aId, name: diagA.name, mergeFactor });
                diagB.score += alonePenalty;
              }

              if (cache.genderAlternate) {
                const gA = cache.genderById.get(aId);
                const gB = cache.genderById.get(bId);
                if (gA && gB) {
                  diagA.neighbors.genderChecked += 1;
                  diagB.neighbors.genderChecked += 1;
                  if (gA === gB) {
                    diagA.neighbors.genderSame.push({ id: bId, name: diagB.name });
                    diagB.neighbors.genderSame.push({ id: aId, name: diagA.name });
                    diagA.score += genderPenalty / 2;
                    diagB.score += genderPenalty / 2;
                  }
                }
              }

              const foesA = cache.foeSetById.get(aId);
              const foesB = cache.foeSetById.get(bId);
              const aFoeB = (foesA instanceof Set && foesA.has(bId));
              const bFoeA = (foesB instanceof Set && foesB.has(aId));
              if (aFoeB || bFoeA) {
                const penalty = 4 * mergeFactor;
                if (aFoeB) {
                  diagA.neighbors.foes.push({ id: bId, name: diagB.name, mergeFactor });
                  diagA.score += penalty;
                }
                if (bFoeA) {
                  diagB.neighbors.foes.push({ id: aId, name: diagA.name, mergeFactor });
                  diagB.score += penalty;
                }
                continue;
              }

              const aLikes = cache.buddySetById.get(aId)?.has(bId) || false;
              const bLikes = cache.buddySetById.get(bId)?.has(aId) || false;
              if (aLikes) {
                const bonus = -mergeFactor * buddyBonusOneWay;
                diagA.neighbors.buddies.push({ id: bId, name: diagB.name, mutual: bLikes, mergeFactor });
                diagA.score += bonus;
              }
              if (bLikes) {
                const bonus = -mergeFactor * buddyBonusOneWay;
                diagB.neighbors.buddies.push({ id: aId, name: diagA.name, mutual: aLikes, mergeFactor });
                diagB.score += bonus;
              }
            }

            for (const [sid, seatIdStr] of seatByStudent.entries()) {
              const diagA = byStudent.get(sid);
              if (!diagA) continue;
              const a = cache.seatCoords.get(seatIdStr);
              const preferenceRows = [];

              const buddies = cache.buddySetById.get(sid);
              if (buddies instanceof Set && buddies.size) {
                for (const buddyId of buddies) {
                  if (!buddyId) continue;
                  const buddySeat = seatByStudent.get(buddyId);
                  const buddyName = nameOf(buddyId);
                  if (!a || !buddySeat) {
                    preferenceRows.push({
                      type: 'Gut',
                      name: buddyName,
                      dist: null,
                      status: 'neutral',
                      statusText: 'Nicht platziert',
                    });
                    continue;
                  }
                  const b = cache.seatCoords.get(buddySeat);
                  if (!b) {
                    preferenceRows.push({
                      type: 'Gut',
                      name: buddyName,
                      dist: null,
                      status: 'neutral',
                      statusText: 'Nicht platziert',
                    });
                    continue;
                  }
                  const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                  const foesA = cache.foeSetById.get(sid);
                  const foesB = cache.foeSetById.get(buddyId);
                  const blocked = (foesA instanceof Set && foesA.has(buddyId))
                    || (foesB instanceof Set && foesB.has(sid));

                  if (dist === 1 && !blocked) {
                    preferenceRows.push({
                      type: 'Gut',
                      name: buddyName,
                      dist,
                      status: 'ok',
                      statusText: 'Erfüllt',
                    });
                    continue;
                  }

                  if (dist >= 2 && dist <= 3 && !blocked) {
                    const factor = foeDistanceEffectFactor(a, b, cache.activeHas);
                    const bonusAbs = scaledBuddyDistance23(BUDDY_DISTANCE_BASE_BONUS_ONE_WAY, dist) * factor;
                    if (bonusAbs) {
                      const bucket = dist === 2 ? 'near' : 'mid';
                      diagA.buddyDistance[bucket].push({
                        id: buddyId,
                        name: buddyName,
                        dist
                      });
                      diagA.score -= bonusAbs;
                    }
                    preferenceRows.push({
                      type: 'Gut',
                      name: buddyName,
                      dist,
                      status: 'warn',
                      statusText: dist === 2 ? 'Teilweise erfüllt (nah)' : 'Teilweise erfüllt',
                    });
                    continue;
                  }

                  preferenceRows.push({
                    type: 'Gut',
                    name: buddyName,
                    dist,
                    status: 'bad',
                    statusText: blocked ? 'Konflikt mit "schlecht"' : 'Nicht erfüllt',
                  });
                }
              }

              const foes = cache.foeSetById.get(sid);
              if (foes instanceof Set && foes.size) {
                for (const foeId of foes) {
                  if (!foeId) continue;
                  const foeSeat = seatByStudent.get(foeId);
                  const foeName = nameOf(foeId);
                  if (!a || !foeSeat) {
                    preferenceRows.push({
                      type: 'Schlecht',
                      name: foeName,
                      dist: null,
                      status: 'neutral',
                      statusText: 'Nicht platziert',
                    });
                    continue;
                  }
                  const b = cache.seatCoords.get(foeSeat);
                  if (!b) {
                    preferenceRows.push({
                      type: 'Schlecht',
                      name: foeName,
                      dist: null,
                      status: 'neutral',
                      statusText: 'Nicht platziert',
                    });
                    continue;
                  }
                  const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                  const factor = foeDistanceEffectFactor(a, b, cache.activeHas);
                  let penalty = 0;
                  let bucket = null;
                  if (dist === 2) {
                    penalty = 1 * factor;
                    bucket = 'near';
                  } else if (dist === 3) {
                    penalty = 0.2 * factor;
                    bucket = 'mid';
                  } else if (dist === 4) {
                    penalty = scaledDistance34(0.2, dist) * factor;
                    bucket = 'far';
                  }
                  if (penalty && bucket) {
                    diagA.foeDistance[bucket].push({
                      id: foeId,
                      name: foeName,
                      dist
                    });
                    diagA.score += penalty;
                  }

                  let status = 'ok';
                  let statusText = 'Erfüllt';
                  if (dist === 1) {
                    status = 'bad';
                    statusText = 'Nicht erfüllt';
                  } else if (dist === 2) {
                    status = 'bad';
                    statusText = 'Nicht erfüllt (zu nah)';
                  } else if (dist === 3) {
                    status = 'warn';
                    statusText = 'Teilweise erfüllt';
                  }
                  preferenceRows.push({
                    type: 'Schlecht',
                    name: foeName,
                    dist,
                    status,
                    statusText,
                  });
                }
              }
              diagA.preferenceRows = preferenceRows;
            }

            byStudent.forEach(diag => { diag.score = -diag.score; });

            return { bySeat, byStudent };
          }

          function createCriteriaItem(label, status, detail) {
            const item = document.createElement('div');
            item.className = `criteria-item ${status}`;
            const icon = document.createElement('div');
            icon.className = 'criteria-icon';
            const iconMap = { ok: '✓', warn: '⚠', bad: '✖', neutral: '•' };
            icon.textContent = iconMap[status] || '•';
            const body = document.createElement('div');
            body.className = 'criteria-body';
            const title = document.createElement('div');
            title.className = 'criteria-label';
            title.textContent = label;
            const info = document.createElement('div');
            info.className = 'criteria-detail';
            info.textContent = detail || '';
            body.appendChild(title);
            body.appendChild(info);
            item.appendChild(icon);
            item.appendChild(body);
            return item;
          }

          function createCriteriaPreferenceTable(diag) {
            const rows = Array.isArray(diag?.preferenceRows) ? diag.preferenceRows : [];
            if (!rows.length) return null;

            const section = document.createElement('section');
            section.className = 'criteria-pref-section';

            const title = document.createElement('div');
            title.className = 'criteria-pref-title';
            title.textContent = 'Sitznachbar-Wünsche';
            section.appendChild(title);

            const wrap = document.createElement('div');
            wrap.className = 'criteria-pref-table-wrap';
            const table = document.createElement('table');
            table.className = 'criteria-pref-table';
            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');
            ['Typ', 'Person', 'Status', 'Distanz'].forEach(label => {
              const th = document.createElement('th');
              th.textContent = label;
              headRow.appendChild(th);
            });
            thead.appendChild(headRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            rows.forEach(row => {
              const tr = document.createElement('tr');

              const tdType = document.createElement('td');
              tdType.className = 'criteria-pref-type';
              tdType.textContent = row.type || '–';
              tr.appendChild(tdType);

              const tdPerson = document.createElement('td');
              tdPerson.className = 'criteria-pref-person';
              tdPerson.textContent = row.name || '–';
              tr.appendChild(tdPerson);

              const tdStatus = document.createElement('td');
              const statusWrap = document.createElement('span');
              statusWrap.className = 'criteria-pref-status';
              statusWrap.appendChild(createStatusPill(row.status || 'neutral', row.statusText || ''));
              const statusText = document.createElement('span');
              statusText.textContent = row.statusText || '';
              statusWrap.appendChild(statusText);
              tdStatus.appendChild(statusWrap);
              tr.appendChild(tdStatus);

              const tdDist = document.createElement('td');
              tdDist.className = 'criteria-pref-distance';
              tdDist.textContent = Number.isFinite(row.dist) ? String(row.dist) : '–';
              tr.appendChild(tdDist);

              tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            wrap.appendChild(table);
            section.appendChild(wrap);
            return section;
          }

          function updateCriteriaPanel() {
            if (!els.criteriaList || !els.criteriaStudent) return;
            const diagMap = state.seatDiagnosticsByStudent;
            const selectedId = state.selectedStudentId;
            if (!(diagMap instanceof Map) || !selectedId || !diagMap.has(selectedId)) {
              els.criteriaStudent.textContent = 'Kein Platz ausgewählt';
              els.criteriaList.textContent = '';
              const empty = document.createElement('div');
              empty.className = 'criteria-empty';
              empty.textContent = 'Klicke auf den Score am Sitzplatz.';
              els.criteriaList.appendChild(empty);
              return;
            }

            const diag = diagMap.get(selectedId);
            els.criteriaStudent.textContent = '';
            const nameNode = document.createElement('span');
            nameNode.className = 'criteria-name';
            nameNode.textContent = diag.name;
            const scoreNode = document.createElement('span');
            scoreNode.className = `criteria-score-inline ${scoreClassForValue(diag.score)}`;
            scoreNode.textContent = `(${formatScoreValue(diag.score)})`;
            els.criteriaStudent.appendChild(nameNode);
            els.criteriaStudent.appendChild(scoreNode);
            els.criteriaList.textContent = '';

            const items = [];

            if (diag.front.wants) {
              if (diag.front.status === 'warn' && diag.front.dist === null) {
                items.push(createCriteriaItem('Vorne (Lehrkraft)', 'warn', 'Lehrkraft ist noch nicht platziert.'));
              } else if (diag.front.status === 'bad') {
                items.push(createCriteriaItem('Vorne (Lehrkraft)', 'bad', `Zu weit entfernt (Distanz ${diag.front.dist}).`));
              } else if (diag.front.status === 'warn') {
                items.push(createCriteriaItem('Vorne (Lehrkraft)', 'warn', `Etwas weit weg (Distanz ${diag.front.dist}).`));
              } else {
                items.push(createCriteriaItem('Vorne (Lehrkraft)', 'ok', 'Maximaler Abstand eingehalten.'));
              }
            }

            if (diag.alone?.wants) {
              const count = diag.alone.neighbors.length;
              if (count === 0) {
                items.push(createCriteriaItem('Alleine', 'ok', 'Keine Sitznachbarn direkt daneben.'));
              } else if (count === 1) {
                const names = formatNameList(diag.alone.neighbors, 2);
                items.push(createCriteriaItem('Alleine', 'warn', `1 Sitznachbar: ${names}.`));
              } else {
                const names = formatNameList(diag.alone.neighbors);
                items.push(createCriteriaItem('Alleine', 'bad', `Mehrere Sitznachbarn: ${names}.`));
              }
            }

            if (state.conditions?.genderAlternation) {
              if (diag.neighbors.genderChecked === 0) {
                items.push(createCriteriaItem('Geschlechterwechsel', 'neutral', 'Keine Geschlechterangaben vorhanden.'));
              } else if (diag.neighbors.genderSame.length) {
                const names = formatNameList(diag.neighbors.genderSame);
                items.push(createCriteriaItem('Geschlechterwechsel', 'bad', `Gleiches Geschlecht nebenan: ${names}.`));
              } else {
                items.push(createCriteriaItem('Geschlechterwechsel', 'ok', 'Abwechselnd zu den Sitznachbarn.'));
              }
            }

            const prefTable = createCriteriaPreferenceTable(diag);
            if (!items.length && !prefTable) {
              const empty = document.createElement('div');
              empty.className = 'criteria-empty';
              empty.textContent = 'Keine aktiven Kriterien gesetzt.';
              els.criteriaList.appendChild(empty);
              return;
            }
            items.forEach(item => els.criteriaList.appendChild(item));
            if (prefTable) {
              els.criteriaList.appendChild(prefTable);
            }
          }

          function buildSummaryStatus(diag, key, opts = {}) {
            if (!diag) return { status: 'neutral', title: '' };
            if (key === 'front') {
              if (!diag.front?.wants) return { status: 'neutral', title: 'Kein Frontwunsch gesetzt.' };
              if (diag.front.status === 'warn' && diag.front.dist === null) {
                return { status: 'warn', title: 'Lehrkraft ist noch nicht platziert.' };
              }
              if (diag.front.status === 'bad') {
                return { status: 'bad', title: `Zu weit entfernt (Distanz ${diag.front.dist}).` };
              }
              if (diag.front.status === 'warn') {
                return { status: 'warn', title: `Etwas weit weg (Distanz ${diag.front.dist}).` };
              }
              return { status: 'ok', title: 'Maximaler Abstand eingehalten.' };
            }
            if (key === 'foes') {
              if (!diag.hasFoes) return { status: 'neutral', title: 'Keine schlechten Sitznachbarn definiert.' };
              if (diag.neighbors.foes.length) {
                return { status: 'bad', title: `Nebenan: ${formatNameList(diag.neighbors.foes)}` };
              }
              return { status: 'ok', title: 'Keine schlechten Sitznachbarn direkt daneben.' };
            }
            if (key === 'buddies') {
              if (!diag.hasBuddyPrefs) return { status: 'neutral', title: 'Keine Wunsch-Nachbarn definiert.' };
              if (diag.neighbors.buddies.length) {
                return { status: 'ok', title: `Nebenan: ${formatNameList(diag.neighbors.buddies)}` };
              }
              if (diag.buddyDistance.near.length) {
                return { status: 'warn', title: `Nah (Distanz 2): ${formatNameList(diag.buddyDistance.near)}` };
              }
              if (diag.buddyDistance.mid.length) {
                return { status: 'warn', title: `Relativ nah (Distanz 3): ${formatNameList(diag.buddyDistance.mid)}` };
              }
              return { status: 'warn', title: 'Kein Wunsch-Nachbar in Distanz 1-3.' };
            }
            if (key === 'alone') {
              if (!diag.alone?.wants) return { status: 'neutral', title: 'Kein Alleine-Wunsch gesetzt.' };
              const count = diag.alone.neighbors.length;
              if (count === 0) return { status: 'ok', title: 'Keine Sitznachbarn direkt daneben.' };
              if (count === 1) return { status: 'warn', title: `1 Sitznachbar: ${formatNameList(diag.alone.neighbors, 2)}` };
              return { status: 'bad', title: `Mehrere Sitznachbarn: ${formatNameList(diag.alone.neighbors)}` };
            }
            if (key === 'gender') {
              if (!opts.genderActive) return { status: 'neutral', title: 'Kriterium deaktiviert.' };
              if (diag.neighbors.genderChecked === 0) {
                return { status: 'neutral', title: 'Keine Geschlechterangaben vorhanden.' };
              }
              if (diag.neighbors.genderSame.length) {
                return { status: 'bad', title: `Gleiches Geschlecht nebenan: ${formatNameList(diag.neighbors.genderSame)}` };
              }
              return { status: 'ok', title: 'Abwechselnd zu den Sitznachbarn.' };
            }
            if (key === 'distance') {
              if (!diag.hasFoes) return { status: 'neutral', title: 'Keine schlechten Sitznachbarn definiert.' };
              if (diag.foeDistance.near.length) {
                return { status: 'bad', title: `Zu nah (Distanz 2): ${formatNameList(diag.foeDistance.near)}` };
              }
              if (diag.foeDistance.mid.length) {
                return { status: 'warn', title: `Relativ nah (Distanz 3): ${formatNameList(diag.foeDistance.mid)}` };
              }
              if (diag.foeDistance.far.length) {
                return { status: 'warn', title: `Noch nah (Distanz 4): ${formatNameList(diag.foeDistance.far)}` };
              }
              return { status: 'ok', title: 'Feinde auf Abstand.' };
            }
            return { status: 'neutral', title: '' };
          }

          function createStatusPill(status, title) {
            const pill = document.createElement('span');
            pill.className = `status-pill ${status}`;
            const iconMap = { ok: '✓', warn: '⚠', bad: '✖', neutral: '•' };
            pill.textContent = iconMap[status] || '•';
            if (title) pill.title = title;
            return pill;
          }

          function createSummarySeatPreferenceList(diag) {
            const rows = Array.isArray(diag?.preferenceRows) ? diag.preferenceRows : [];
            if (!rows.length) {
              const empty = document.createElement('span');
              empty.className = 'summary-pref-empty';
              empty.textContent = '–';
              return empty;
            }
            const sortedRows = rows.slice().sort((a, b) => {
              const ta = a?.type === 'Gut' ? 0 : 1;
              const tb = b?.type === 'Gut' ? 0 : 1;
              if (ta !== tb) return ta - tb;
              return String(a?.name || '').localeCompare(String(b?.name || ''), 'de');
            });

            const goodRows = sortedRows.filter(row => row?.type === 'Gut');
            const badRows = sortedRows.filter(row => row?.type === 'Schlecht');

            const wrap = document.createElement('div');
            wrap.className = 'summary-pref-split';

            const buildCol = (className, prefRows) => {
              const col = document.createElement('div');
              col.className = `summary-pref-col ${className}`.trim();

              if (!prefRows.length) {
                const empty = document.createElement('span');
                empty.className = 'summary-pref-empty';
                empty.textContent = '–';
                col.appendChild(empty);
                return col;
              }

              prefRows.forEach(row => {
                const entry = document.createElement('div');
                entry.className = 'summary-pref-entry';
                const distanceHint = Number.isFinite(row?.dist) ? `Distanz ${row.dist}` : 'Nicht platziert';
                const tooltip = [row?.statusText || '', distanceHint].filter(Boolean).join(' | ');
                entry.title = tooltip;

                const name = document.createElement('span');
                name.className = 'summary-pref-entry-name';
                name.textContent = row?.name || '–';
                name.title = tooltip;
                entry.appendChild(name);

                entry.appendChild(createStatusPill(row?.status || 'neutral', tooltip));
                col.appendChild(entry);
              });

              return col;
            };

            wrap.appendChild(buildCol('good', goodRows));
            wrap.appendChild(buildCol('bad', badRows));
            return wrap;
          }

          function buildSummaryTable() {
            if (!els.summaryTableBody || !els.summaryTableHead || !els.summaryEmpty) return;
            updateSeatDiagnostics();
            const diagMap = state.seatDiagnosticsByStudent;
            const rows = (diagMap instanceof Map) ? Array.from(diagMap.values()) : [];
            const genderActive = !!state.conditions?.genderAlternation;
            const anyFront = rows.some(d => d.front?.wants);
            const anyAlone = rows.some(d => d.alone?.wants);
            const anySeatPrefs = rows.some(d => Array.isArray(d.preferenceRows) && d.preferenceRows.length);

            const columns = [
              { key: 'name', label: 'Schüler' },
              { key: 'score', label: 'Score' },
            ];
            if (anyFront) columns.push({ key: 'front', label: 'Vorne' });
            if (anyAlone) columns.push({ key: 'alone', label: 'Alleine' });
            if (anySeatPrefs) columns.push({ key: 'seatprefs', label: 'Sitznachbar-Wünsche' });
            if (genderActive) columns.push({ key: 'gender', label: 'm/w' });

            els.summaryTableHead.textContent = '';
            columns.forEach(col => {
              const th = document.createElement('th');
              th.className = `summary-col-${col.key}`;
              if (col.key === 'seatprefs') {
                const header = document.createElement('div');
                header.className = 'summary-seatprefs-header';

                const main = document.createElement('div');
                main.className = 'summary-seatprefs-header-main';
                main.textContent = col.label;
                header.appendChild(main);

                const split = document.createElement('div');
                split.className = 'summary-seatprefs-header-split';
                const good = document.createElement('span');
                good.className = 'summary-seatprefs-header-good';
                good.textContent = 'Gut';
                split.appendChild(good);
                const bad = document.createElement('span');
                bad.className = 'summary-seatprefs-header-bad';
                bad.textContent = 'Schlecht';
                split.appendChild(bad);
                header.appendChild(split);
                th.appendChild(header);
              } else {
                th.textContent = col.label;
              }
              els.summaryTableHead.appendChild(th);
            });

            els.summaryTableBody.textContent = '';
            if (!rows.length) {
              els.summaryEmpty.hidden = false;
              return;
            }
            els.summaryEmpty.hidden = true;

            rows.sort((a, b) => {
              const ds = (b.score || 0) - (a.score || 0);
              if (Math.abs(ds) > 1e-9) return ds;
              return String(a.name || '').localeCompare(String(b.name || ''), 'de');
            });

            rows.forEach(diag => {
              const tr = document.createElement('tr');
              columns.forEach(col => {
                const td = document.createElement('td');
                td.className = `summary-col-${col.key}`;
                if (col.key === 'name') {
                  const name = document.createElement('span');
                  name.className = 'summary-name';
                  name.textContent = diag.name;
                  td.appendChild(name);
                } else if (col.key === 'score') {
                  const score = document.createElement('span');
                  score.className = `summary-score ${scoreClassForValue(diag.score)}`;
                  score.textContent = formatScoreValue(diag.score);
                  td.appendChild(score);
                } else if (col.key === 'seatprefs') {
                  td.appendChild(createSummarySeatPreferenceList(diag));
                } else {
                  const status = buildSummaryStatus(diag, col.key, { genderActive });
                  td.appendChild(createStatusPill(status.status, status.title));
                }
                tr.appendChild(td);
              });
              els.summaryTableBody.appendChild(tr);
            });
          }

          function updateSeatSelectionHighlight(bySeat) {
            if (!els.grid) return;
            const selectedId = state.selectedStudentId;
            els.grid.querySelectorAll('.seat.seat-selected').forEach(seat => seat.classList.remove('seat-selected'));
            if (!selectedId || !(bySeat instanceof Map)) return;
            const seatEntry = Array.from(bySeat.entries()).find(([, diag]) => diag.studentId === selectedId);
            if (!seatEntry) return;
            const seatId = seatEntry[0];
            const seatEl = els.grid.querySelector(`.seat[data-seat="${seatId}"]`);
            if (seatEl) seatEl.classList.add('seat-selected');
          }

          function selectStudentForCriteria(studentId) {
            state.selectedStudentId = studentId || null;
            updateCriteriaPanel();
            updateSeatSelectionHighlight(state.seatDiagnosticsBySeat);
            if (state.selectedStudentId) {
              openCriteriaDialog();
            }
          }

          function updateSeatDiagnostics() {
            const result = computeSeatDiagnostics();
            state.seatDiagnosticsBySeat = result.bySeat;
            state.seatDiagnosticsByStudent = result.byStudent;
            const showSeatScores = hasAnyConfiguredPreference();

            if (els.grid) {
              els.grid.querySelectorAll('.seat').forEach(seat => {
                seat.classList.remove('seat-selected');
                seat.querySelectorAll('.seat-score, .seat-info').forEach(node => node.remove());
                const seatId = seat.dataset.seat;
                const diag = result.bySeat.get(seatId);
                if (!diag || !showSeatScores) return;
                const scoreLink = document.createElement('a');
                scoreLink.href = '#';
                scoreLink.className = `seat-score ${scoreClassForValue(diag.score)}`;
                scoreLink.textContent = formatScoreValue(diag.score);
                scoreLink.title = 'Individueller Score (Kriterien anzeigen)';
                scoreLink.setAttribute('aria-label', `Kriterien für ${diag.name} anzeigen`);
                scoreLink.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectStudentForCriteria(diag.studentId);
                });
                scoreLink.addEventListener('keydown', (e) => {
                  if (e.key === ' ' || e.key === 'Spacebar') {
                    e.preventDefault();
                    selectStudentForCriteria(diag.studentId);
                  }
                });
                seat.appendChild(scoreLink);
              });
            }

            if (state.selectedStudentId && !result.byStudent.has(state.selectedStudentId)) {
              state.selectedStudentId = null;
            }
            updateCriteriaPanel();
            updateSeatSelectionHighlight(result.bySeat);
          }

          function renderSeatLinks() {
            updateSidebarScore();
            applyMergeIconVisibility();
            applySeatScoreVisibility();
            if (!els.grid) return;
            if (state.mergeMode === 'forbid') {
              state.mergedPairs = new Set();
              const layer = ensureGridLinksLayer(true);
              const mergeLayer = ensureMergeLayer(true);
              if (!layer || !mergeLayer) return;
              return;
            }
            if (state.mergedPairs && state.mergedPairs.size) {
              const next = new Set();
              state.mergedPairs.forEach(key => {
                const [a, b] = key.split('|');
                if (state.activeSeats.has(a) && state.activeSeats.has(b)) {
                  next.add(key);
                }
              });
              state.mergedPairs = next;
            }
            const layer = ensureGridLinksLayer(true);
            const mergeLayer = ensureMergeLayer(true);
            if (!layer || !mergeLayer || !state.activeSeats.size) return;
            const seatEls = new Map();
            const mergedMap = new Map();
            if (state.mergedPairs && state.mergedPairs.size) {
              state.mergedPairs.forEach(key => {
                const [a, b] = key.split('|');
                if (a && b) {
                  mergedMap.set(a, b);
                  mergedMap.set(b, a);
                }
              });
            }
            els.grid.querySelectorAll('.seat').forEach(el => {
              const id = el.dataset.seat;
              if (id) seatEls.set(id, el);
            });
            const pairs = [];
            state.activeSeats.forEach(id => {
              if (state.seats[id] === 'TEACHER') return;
              const [r, c] = (id || '').split('-').map(Number);
              if (!Number.isFinite(r) || !Number.isFinite(c)) return;
              const right = seatId(r, c + 1);
              const down = seatId(r + 1, c);
              const mergedWith = mergedMap.get(id) || null;
              const consider = (neighbor) => {
                if (!state.activeSeats.has(neighbor)) return;
                if (state.seats[neighbor] === 'TEACHER') return;
                const neighborMerged = mergedMap.get(neighbor) || null;
                if (mergedWith && mergedWith !== neighbor) return;
                if (neighborMerged && neighborMerged !== id) return;
                pairs.push([id, neighbor]);
              };
              consider(right);
              consider(down);
            });
            pairs.forEach(([aId, bId]) => {
              const aEl = seatEls.get(aId);
              const bEl = seatEls.get(bId);
              if (!aEl || !bEl) return;
              const key = pairKey(aId, bId);
              const aCenterX = aEl.offsetLeft + (aEl.offsetWidth / 2);
              const aCenterY = aEl.offsetTop + (aEl.offsetHeight / 2);
              const bCenterX = bEl.offsetLeft + (bEl.offsetWidth / 2);
              const bCenterY = bEl.offsetTop + (bEl.offsetHeight / 2);
              const x = (aCenterX + bCenterX) / 2;
              const y = (aCenterY + bCenterY) / 2;
              const dx = bCenterX - aCenterX;
              const dy = bCenterY - aCenterY;
              const len = Math.max(0, Math.hypot(dx, dy));
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              const isMerged = key && state.mergedPairs.has(key);
              const shouldAnimateUnderlay = key && state.justMergedPairs && state.justMergedPairs.has(key);
              if (isMerged) {
                const gap = currentGridGap();
                const pad = Math.max(2, Math.min(6, gap * 0.35));
                const left = Math.min(aEl.offsetLeft, bEl.offsetLeft) - pad;
                const top = Math.min(aEl.offsetTop, bEl.offsetTop) - pad;
                const right = Math.max(aEl.offsetLeft + aEl.offsetWidth, bEl.offsetLeft + bEl.offsetWidth) + pad;
                const bottom = Math.max(aEl.offsetTop + aEl.offsetHeight, bEl.offsetTop + bEl.offsetHeight) + pad;
                const underlay = document.createElement('div');
                underlay.className = shouldAnimateUnderlay ? 'merge-underlay merge-animate' : 'merge-underlay';
                underlay.style.left = `${left}px`;
                underlay.style.top = `${top}px`;
                underlay.style.width = `${right - left}px`;
                underlay.style.height = `${bottom - top}px`;
                mergeLayer.appendChild(underlay);
                if (shouldAnimateUnderlay) {
                  state.justMergedPairs.delete(key);
                }
                const aRect = {
                  left: aEl.offsetLeft,
                  right: aEl.offsetLeft + aEl.offsetWidth,
                  top: aEl.offsetTop,
                  bottom: aEl.offsetTop + aEl.offsetHeight,
                  width: aEl.offsetWidth,
                  height: aEl.offsetHeight,
                  centerY: aEl.offsetTop + (aEl.offsetHeight / 2),
                  centerX: aEl.offsetLeft + (aEl.offsetWidth / 2),
                };
                const bRect = {
                  left: bEl.offsetLeft,
                  right: bEl.offsetLeft + bEl.offsetWidth,
                  top: bEl.offsetTop,
                  bottom: bEl.offsetTop + bEl.offsetHeight,
                  width: bEl.offsetWidth,
                  height: bEl.offsetHeight,
                  centerY: bEl.offsetTop + (bEl.offsetHeight / 2),
                  centerX: bEl.offsetLeft + (bEl.offsetWidth / 2),
                };
                const horizontal = Math.abs(dx) >= Math.abs(dy);
              }
              const node = document.createElement('div');
              node.className = 'grid-link';
              node.textContent = isMerged ? '⛓️‍💥' : '🔗';
              node.dataset.a = aId;
              node.dataset.b = bId;
              if (isMerged) {
                node.dataset.merged = '1';
                node.classList.add('merged');
              }
              node.style.left = `${x}px`;
              node.style.top = `${y}px`;
              layer.appendChild(node);
            });
          }

          function triggerMergeAnimation(aId, bId) {
            if (!els.grid) return;
            if (state.mergeMode === 'forbid') return;
            if (state.seats[aId] === 'TEACHER' || state.seats[bId] === 'TEACHER') return;
            const key = pairKey(aId, bId);
            if (key) {
              if (!state.mergedPairs) state.mergedPairs = new Set();
              state.mergedPairs.add(key);
              if (!state.justMergedPairs) state.justMergedPairs = new Set();
              state.justMergedPairs.add(key);
            }
            markOptimalScoreStale();
            renderSeatLinks();
          }

          function unmergePair(aId, bId) {
            if (!state.mergedPairs) state.mergedPairs = new Set();
            const key = pairKey(aId, bId);
            if (key) {
              state.mergedPairs.delete(key);
              markOptimalScoreStale();
              renderSeatLinks();
            }
          }

          function buildGrid() {
            enforceGridBounds();
            const rows = state.gridRows;
            const cols = state.gridCols;
            els.grid.style.gridTemplateColumns = `repeat(${cols}, minmax(var(--seat-min-width, 80px), 1fr))`;
            els.grid.style.gridTemplateRows = `repeat(${rows}, minmax(var(--seat-min-height, 72px), 1fr))`;
            els.grid.innerHTML = '';
            for (let r = 1; r <= rows; r++) {
              for (let c = 1; c <= cols; c++) {
                const seat = document.createElement('div');
                seat.className = 'seat';
                const id = seatId(r, c);
                seat.dataset.seat = id;
                seat.innerHTML = `<div class="name"></div>`;
                if (state.activeSeats.has(id)) seat.classList.add('active');
                addDropHandlers(seat);
                enableTouchDragSource(seat, () => {
                  if (!seat.classList.contains('active')) return null;
                  if (state.seats[id]) return null;
                  return { type: 'seat', seatId: id, label: 'Sitzplatz' };
                });
                seat.addEventListener('click', () => {
                  const id = seat.dataset.seat;
                  if (!seat.classList.contains('active')) {
                    seat.classList.add('active');
                    state.activeSeats.add(id);
                    markOptimalScoreStale();
                    renderSeatLinks();
                    return;
                  }
                  if (state.seats[id]) {
                    state.seats[id] = null;
                    renderSeats();
                    refreshUnseated();
                  } else {
                    seat.classList.remove('active');
                    state.activeSeats.delete(id);
                    markOptimalScoreStale();
                    renderSeatLinks();
                  }
                });
                seat.addEventListener('dragstart', e => {
                  if (e.target.closest('.seat-content')) return;
                  const isActiveEmpty = seat.classList.contains('active') && !state.seats[id];
                  if (isActiveEmpty) {
                    e.dataTransfer.setData('text/plain', `SEAT:${id}`);
                    e.dataTransfer.effectAllowed = 'move';
                    state.dragSourceSeat = id;
                    state.dragPayloadType = 'seat';
                  } else {
                    e.preventDefault();
                  }
                });
                seat.addEventListener('dragend', () => {
                  if (state.dragPayloadType === 'seat') {
                    state.dragSourceSeat = null;
                    state.dragPayloadType = null;
                  }
                });
                els.grid.appendChild(seat);
              }
            }
            renderSeats();
            updateGridViewportMode();
          }

          function renderSeats(options = {}) {
            if (!options.skipOptimalMark) {
              markOptimalScoreStale();
            }
            [...els.grid.querySelectorAll('.seat')].forEach(seat => {
              const id = seat.dataset.seat;
              const sid = state.seats[id];
              const nameEl = seat.querySelector('.name');
              seat.classList.remove('teacher-seat');
              nameEl.innerHTML = '';
              if (!sid) {
                if (seat.classList.contains('active')) {
                  seat.setAttribute('draggable', 'true');
                  seat.dataset.emptyDraggable = '1';
                } else {
                  seat.removeAttribute('draggable');
                  delete seat.dataset.emptyDraggable;
                }
                return;
              }
              seat.removeAttribute('draggable');
              delete seat.dataset.emptyDraggable;
              const content = document.createElement('div');
              content.className = 'seat-content';
              content.dataset.sid = sid;
              content.dataset.fromSeat = id;
              if (sid === 'TEACHER') {
                seat.classList.add('teacher-seat');
                content.classList.add('teacher');
                content.innerHTML = `
            <span class="teacher-emoji" aria-hidden="true">👑</span>
            <span class="teacher-label">Lehrkraft</span>
          `;
                content.setAttribute('draggable', 'true');
                nameEl.appendChild(content);
                addDragHandlers(content);
                return;
              } else {
                const s = state.students.find(x => x.id === sid);
                const label = s ? displayName(s).trim() : '';
                if (!label) {
                  state.seats[id] = null;
                  return;
                }
                content.textContent = label;
                content.setAttribute('draggable', 'true');
              }
              nameEl.appendChild(content);
              addDragHandlers(content);
              enableTouchDragSource(content, () => {
                const sid = content.dataset.sid;
                if (!sid) return null;
                const fromSeat = content.dataset.fromSeat || null;
                if (fromSeat && state.seats[fromSeat] !== sid) return null;
                return {
                  type: 'assignment',
                  studentId: sid,
                  fromSeat,
                  label: sid === 'TEACHER' ? 'Lehrkraft' : (content.textContent || 'Lernende/r')
                };
              });
            });
            updateGridAutoScale();
            renderSeatLinks();
          }

          function addDragHandlers(el) {
            if (el.dataset.dragBound) return;
            if (el.getAttribute('draggable') !== 'true') return;
            el.dataset.dragBound = '1';
            el.addEventListener('dragstart', e => {
              const sid = el.dataset.sid;
              const fromSeat = el.dataset.fromSeat || null;
              if (!sid) { e.preventDefault(); return; }
              if (fromSeat && state.seats[fromSeat] !== sid) { e.preventDefault(); return; }
              e.dataTransfer.setData('text/plain', sid);
              e.dataTransfer.effectAllowed = 'move';
              el.classList.add('dragging');
              const rect = el.getBoundingClientRect();
              const preview = document.createElement('div');
              preview.className = 'drag-preview';
              preview.textContent = el.textContent || '';
              preview.style.width = `${Math.max(rect.width, 90)}px`;
              preview.style.height = `${Math.max(rect.height, 40)}px`;
              document.body.appendChild(preview);
              if (typeof e.dataTransfer.setDragImage === 'function') {
                e.dataTransfer.setDragImage(preview, rect.width / 2, rect.height / 2);
              }
              setTimeout(() => preview.remove(), 0);
              state.dragSourceSeat = fromSeat;
              state.dragPayloadType = 'assignment';
            });
            el.addEventListener('dragend', () => {
              state.dragSourceSeat = null;
              state.dragPayloadType = null;
              el.classList.remove('dragging');
            });
          }

          function addDropHandlers(seat) {
            seat.addEventListener('dragover', e => { e.preventDefault(); seat.classList.add('drag-over'); });
            seat.addEventListener('dragleave', () => seat.classList.remove('drag-over'));
            seat.addEventListener('drop', e => {
              e.preventDefault(); seat.classList.remove('drag-over');
              const payload = e.dataTransfer.getData('text/plain') || '';
              const targetId = seat.dataset.seat;
              const sourceSeat = state.dragSourceSeat;
              const dragType = state.dragPayloadType;
              const seatPayload = payload.startsWith('SEAT:') ? payload.slice(5) : null;
              const targetWasActive = seat.classList.contains('active');
              state.dragSourceSeat = null;
              state.dragPayloadType = null;
              const seatDragSource = dragType === 'seat'
                ? (sourceSeat || seatPayload)
                : (!dragType && seatPayload ? seatPayload : null);
              const context = {
                targetSeatEl: seat,
                targetId,
                wasActive: targetWasActive,
              };
              if (seatDragSource) {
                context.seatDragSourceId = seatDragSource;
              } else if (payload) {
                context.studentId = payload;
                context.sourceSeatId = sourceSeat || null;
              }
              seat.classList.add('drop-anim', 'ripple');
              setTimeout(() => seat.classList.remove('drop-anim', 'ripple'), 450);
              applySeatDropAction(context);
            });
          }

          function applySeatDropAction(opts) {
            if (!opts || !opts.targetSeatEl || !opts.targetId) return false;
            const seatEl = opts.targetSeatEl;
            const targetId = opts.targetId;
            const targetWasActive = !!opts.wasActive;
            const seatDragSourceId = opts.seatDragSourceId || null;
            const studentId = opts.studentId || null;
            const sourceSeatId = opts.sourceSeatId || null;
            if (seatDragSourceId) {
              if (seatDragSourceId === targetId) return false;
              if (targetWasActive) return false;
              if (!state.activeSeats.has(seatDragSourceId)) return false;
              if (state.seats[seatDragSourceId]) return false;
              state.activeSeats.delete(seatDragSourceId);
              const sourceSeatEl = els.grid.querySelector(`[data-seat="${seatDragSourceId}"]`);
              if (sourceSeatEl) {
                sourceSeatEl.classList.remove('active');
                sourceSeatEl.removeAttribute('draggable');
                delete sourceSeatEl.dataset.emptyDraggable;
              }
              seatEl.classList.add('active');
              state.activeSeats.add(targetId);
              seatEl.setAttribute('draggable', 'true');
              seatEl.dataset.emptyDraggable = '1';
              state.seats[targetId] = null;
              state.seats[seatDragSourceId] = null;
              renderSeats();
              return true;
            }
            if (!studentId) return false;
            if (sourceSeatId && sourceSeatId === targetId) return false;
            const prev = state.seats[targetId];
            if (!targetWasActive) {
              seatEl.classList.add('active');
              state.activeSeats.add(targetId);
            }
            if (studentId === 'TEACHER') {
              const prevTeacherSeats = Object.entries(state.seats).filter(([, val]) => val === 'TEACHER').map(([id]) => id);
              for (const key of Object.keys(state.seats)) {
                if (state.seats[key] === 'TEACHER' && key !== sourceSeatId && key !== targetId) {
                  state.seats[key] = null;
                }
              }
              removeMergesInvolving([...prevTeacherSeats, targetId]);
            } else if (prev === 'TEACHER') {
              return false;
            }
            if (sourceSeatId) {
              state.seats[targetId] = studentId;
              if (prev && prev !== studentId) {
                state.seats[sourceSeatId] = prev;
              } else if (targetId !== sourceSeatId) {
                state.seats[sourceSeatId] = null;
                if (!targetWasActive) {
                  const sourceSeatEl = els.grid.querySelector(`[data-seat="${sourceSeatId}"]`);
                  if (sourceSeatEl) {
                    sourceSeatEl.classList.remove('active');
                  }
                  state.activeSeats.delete(sourceSeatId);
                }
              }
            } else {
              state.seats[targetId] = studentId;
            }
            renderSeats();
            refreshUnseated();
            return true;
          }

          function enableTouchDragSource(el, resolver) {
            if (!supportsTouchDrag || !el || el.dataset.touchDragBound) return;
            el.dataset.touchDragBound = '1';
            el.addEventListener('touchstart', e => {
              if (e.touches.length !== 1) return;
              const descriptor = typeof resolver === 'function' ? resolver(e) : null;
              if (!descriptor) return;
              const touch = e.touches[0];
              startTouchDragCandidate(descriptor, touch);
            }, { passive: true });
            el.addEventListener('touchmove', e => {
              if (!touchDragState) return;
              const tracked = findTouchById(e.touches, touchDragState.identifier);
              if (!tracked) return;
              handleTouchMove(tracked);
              if (touchDragState && touchDragState.active) {
                e.preventDefault();
              }
            }, { passive: false });
            const finish = e => {
              if (!touchDragState) return;
              const tracked = findTouchById(e.changedTouches, touchDragState.identifier);
              if (!tracked) return;
              finishTouchDrag(e);
            };
            const cancel = e => {
              if (!touchDragState) return;
              const tracked = findTouchById(e.changedTouches, touchDragState.identifier);
              if (!tracked) return;
              cancelTouchDrag();
            };
            el.addEventListener('touchend', finish, { passive: false });
            el.addEventListener('touchcancel', cancel);
          }

          function startTouchDragCandidate(descriptor, touch) {
            cancelTouchDrag();
            const state = {
              descriptor,
              identifier: touch.identifier,
              startX: touch.clientX,
              startY: touch.clientY,
              currentX: touch.clientX,
              currentY: touch.clientY,
              active: false,
              ghost: null,
              overSeat: null,
              timer: null,
            };
            state.timer = setTimeout(() => beginTouchDrag(state), TOUCH_DRAG_DELAY_MS);
            touchDragState = state;
          }

          function beginTouchDrag(state) {
            if (!state || state !== touchDragState) return;
            state.active = true;
            state.ghost = createTouchGhost(state.descriptor);
            updateTouchDrag(state);
          }

          function handleTouchMove(touch) {
            if (!touchDragState) return;
            touchDragState.currentX = touch.clientX;
            touchDragState.currentY = touch.clientY;
            if (!touchDragState.active) {
              const dx = Math.abs(touch.clientX - touchDragState.startX);
              const dy = Math.abs(touch.clientY - touchDragState.startY);
              if (dx > TOUCH_DRAG_CANCEL_DISTANCE || dy > TOUCH_DRAG_CANCEL_DISTANCE) {
                cancelTouchDrag();
              }
              return;
            }
            updateTouchDrag(touchDragState);
          }

          function updateTouchDrag(state) {
            if (!state) return;
            if (state.ghost) {
              state.ghost.style.transform = `translate(${state.currentX + 14}px, ${state.currentY + 14}px)`;
            }
            const seat = findSeatAtPoint(state.currentX, state.currentY);
            if (seat !== state.overSeat) {
              if (state.overSeat) state.overSeat.classList.remove('drag-over');
              state.overSeat = seat;
              if (seat) seat.classList.add('drag-over');
            }
          }

          function finishTouchDrag(e) {
            if (!touchDragState) return;
            const state = touchDragState;
            const descriptor = state.descriptor;
            const seatEl = state.overSeat;
            const wasActive = seatEl ? seatEl.classList.contains('active') : false;
            const context = seatEl ? buildTouchDropContext(descriptor, seatEl, wasActive) : null;
            const wasActiveDrag = state.active;
            cancelTouchDrag();
            if (!wasActiveDrag) return;
            if (e) e.preventDefault();
            if (context) {
              applySeatDropAction(context);
            }
          }

          function cancelTouchDrag() {
            if (!touchDragState) return;
            if (touchDragState.timer) {
              clearTimeout(touchDragState.timer);
            }
            if (touchDragState.overSeat) {
              touchDragState.overSeat.classList.remove('drag-over');
            }
            if (touchDragState.ghost) {
              touchDragState.ghost.remove();
            }
            touchDragState = null;
          }

          function buildTouchDropContext(descriptor, seatEl, wasActive) {
            if (!descriptor || !seatEl) return null;
            const seatId = seatEl.dataset.seat;
            if (!seatId) return null;
            const ctx = { targetSeatEl: seatEl, targetId: seatId, wasActive };
            if (descriptor.type === 'seat') {
              ctx.seatDragSourceId = descriptor.seatId;
            } else if (descriptor.type === 'assignment') {
              ctx.studentId = descriptor.studentId;
              ctx.sourceSeatId = descriptor.fromSeat || null;
            } else {
              return null;
            }
            return ctx;
          }

          function findSeatAtPoint(x, y) {
            const el = document.elementFromPoint(x, y);
            if (!el) return null;
            return el.closest ? el.closest('.seat') : null;
          }

          function findTouchById(touchList, id) {
            if (!touchList || id === undefined || id === null) return null;
            for (let i = 0; i < touchList.length; i++) {
              const touch = touchList.item(i);
              if (touch?.identifier === id) return touch;
            }
            return null;
          }

          function createTouchGhost(descriptor) {
            const ghost = document.createElement('div');
            ghost.className = 'touch-drag-ghost';
            const fallback = descriptor?.type === 'seat' ? 'Sitzplatz' : 'Ziehen';
            ghost.textContent = descriptor?.label || fallback;
            document.body.appendChild(ghost);
            return ghost;
          }

          function detectDelimiter(s) {
            const firstLine = s.split(/\r?\n/)[0] || '';
            const commas = (firstLine.match(/,/g) || []).length;
            const semis = (firstLine.match(/;/g) || []).length;
            return semis > commas ? ';' : ',';
          }
          function parseCSV(text) {
            const delim = detectDelimiter(text); state.delim = delim;
            const rows = [];
            let i = 0, cur = '', inQ = false; const out = []; const push = () => { out.push(cur); cur = '' };
            const flush = () => { rows.push(out.slice()); out.length = 0 };
            while (i < text.length) {
              const ch = text[i++];
              if (ch === '"') {
                if (inQ && text[i] == '"') { cur += '"'; i++; }
                else inQ = !inQ;
              } else if (ch === delim && !inQ) { push(); }
              else if ((ch === '\n') && !inQ) { push(); flush(); }
              else if ((ch === '\r') && !inQ) { }
              else { cur += ch; }
            }
            if (cur.length > 0 || out.length > 0) { push(); flush(); }
            return rows;
          }

          function readStudents(rows) {
            const colL = 1;
            const colF = 2;
            const students = [];
            for (const r of rows) {
              const last = (r[colL] || '').trim();
              const first = (r[colF] || '').trim();
              if (last || first) {
                const id = String(students.length + 1).padStart(2, '0');
                students.push({ id, first, last, buddies: [], foes: [], prefersAlone: false });
              }
            }
            return students;
          }

          function buildPreferenceIndex(studentById) {
            const buddySetById = new Map();
            const foeSetById = new Map();
            const genderById = new Map();
            const incomingFoesById = new Map();
            if (studentById && typeof studentById.forEach === 'function') {
              studentById.forEach((student, sid) => {
                if (!sid) return;
                const buddies = getBuddyList(student);
                buddySetById.set(sid, new Set(buddies.filter(Boolean)));

                const foes = Array.isArray(student?.foes) ? student.foes : [];
                const foeSet = new Set(foes.filter(Boolean));
                foeSetById.set(sid, foeSet);
                foeSet.forEach(fid => {
                  if (!fid) return;
                  if (!incomingFoesById.has(fid)) incomingFoesById.set(fid, new Set());
                  incomingFoesById.get(fid).add(sid);
                });

                genderById.set(sid, genderCode(student));
              });
            }
            const allFoesById = new Map();
            if (studentById && typeof studentById.forEach === 'function') {
              studentById.forEach((student, sid) => {
                const outgoing = foeSetById.get(sid) || new Set();
                const incoming = incomingFoesById.get(sid) || new Set();
                if (!outgoing.size && !incoming.size) {
                  allFoesById.set(sid, new Set());
                  return;
                }
                if (!incoming.size) { allFoesById.set(sid, outgoing); return; }
                if (!outgoing.size) { allFoesById.set(sid, incoming); return; }
                const union = new Set(outgoing);
                incoming.forEach(x => union.add(x));
                allFoesById.set(sid, union);
              });
            }
            return { buddySetById, foeSetById, incomingFoesById, allFoesById, genderById };
          }

          function createConflictCache(activeSet, studentById, mergedPairs = new Set(), options = {}) {
            const activeIds = Array.isArray(options.activeIds)
              ? options.activeIds
              : (activeSet && typeof activeSet.forEach === 'function')
                ? Array.from(activeSet)
                : [];
            const activeHas = (activeSet && typeof activeSet.has === 'function') ? activeSet : new Set(activeIds);

            const seatCoords = new Map();
            activeIds.forEach(seatIdStr => {
              const [r, c] = (seatIdStr || '').split('-').map(Number);
              if (Number.isFinite(r) && Number.isFinite(c)) seatCoords.set(seatIdStr, { r, c });
            });

            const activeRows = Array.isArray(options.activeRows) ? options.activeRows : getActiveRows(activeHas);
            const rowIndex = new Map();
            activeRows.forEach((row, idx) => { rowIndex.set(row, idx); });

            const seatRowIndex = new Map();
            seatCoords.forEach((coords, seatIdStr) => {
              const idx = rowIndex.get(coords.r);
              if (idx !== undefined) seatRowIndex.set(seatIdStr, idx);
            });

            const adjacentPairs = [];
            activeIds.forEach(seatIdStr => {
              const coords = seatCoords.get(seatIdStr);
              if (!coords) return;
              const right = seatId(coords.r, coords.c + 1);
              if (activeHas.has(right)) {
                const key = pairKey(seatIdStr, right);
                const mergeFactor = key && mergedPairs instanceof Set && mergedPairs.has(key) ? 2 : 1;
                adjacentPairs.push([seatIdStr, right, mergeFactor]);
              }
              const down = seatId(coords.r + 1, coords.c);
              if (activeHas.has(down)) {
                const key = pairKey(seatIdStr, down);
                const mergeFactor = key && mergedPairs instanceof Set && mergedPairs.has(key) ? 2 : 1;
                adjacentPairs.push([seatIdStr, down, mergeFactor]);
              }
            });

            const teacherDistanceMap = options.teacherDistanceMap instanceof Map ? options.teacherDistanceMap : getTeacherDistanceMap();
            const teacherDistanceWanted = options.teacherDistanceWanted instanceof Set
              ? options.teacherDistanceWanted
              : new Set(Array.from(teacherDistanceMap.keys()));
            const genderAlternate = (typeof options.genderAlternate === 'boolean')
              ? options.genderAlternate
              : !!state.conditions?.genderAlternation;

            return {
              activeIds,
              activeHas,
              seatCoords,
              activeRows,
              rowIndex,
              seatRowIndex,
              adjacentPairs,
              mergedPairs,
              teacherDistanceWanted,
              genderAlternate,
              ...buildPreferenceIndex(studentById),
            };
          }

          function countConflicts(map, activeSet, studentById, mergedPairs = new Set(), cache = null) {
            if (!(map instanceof Map)) return 0;
            const cached = cache && cache.seatCoords && cache.adjacentPairs
              ? cache
              : createConflictCache(activeSet, studentById, mergedPairs);

            let n = 0;
            const genderPenalty = 1;
            const foeDistancePenalty = 0.2;
            const buddyBonusOneWay = BUDDY_ADJACENT_BONUS_ONE_WAY;
            const aloneNeighborPenalty = ALONE_NEIGHBOR_PENALTY;

            const seatByStudent = new Map();
            let teacherSeatId = null;
            for (const [seatIdStr, sid] of map) {
              if (sid === 'TEACHER') {
                teacherSeatId = seatIdStr;
              } else if (sid) {
                seatByStudent.set(sid, seatIdStr);
              }
            }

            const teacherCoords = teacherSeatId ? cached.seatCoords.get(teacherSeatId) : null;
            const teacherRowIdx = (teacherCoords && cached.rowIndex.has(teacherCoords.r))
              ? cached.rowIndex.get(teacherCoords.r)
              : null;
            if (teacherRowIdx !== null && cached.teacherDistanceWanted && cached.teacherDistanceWanted.size) {
              cached.teacherDistanceWanted.forEach(studentId => {
                const seatIdStr = seatByStudent.get(studentId);
                if (!seatIdStr) return;
                const seatRowIdx = cached.seatRowIndex.get(seatIdStr);
                if (seatRowIdx === undefined) return;
                const dist = Math.abs(seatRowIdx - teacherRowIdx);
                if (dist >= 3) n += 3;
                else if (dist === 2) n += 1;
              });
            }

            for (let i = 0; i < cached.adjacentPairs.length; i++) {
              const [aSeat, bSeat, mergeFactorRaw] = cached.adjacentPairs[i];
              const aId = map.get(aSeat);
              const bId = map.get(bSeat);
              if (!aId || !bId) continue;
              if (aId === 'TEACHER' || bId === 'TEACHER') continue;
              const aStudent = studentById.get(aId);
              const bStudent = studentById.get(bId);
              if (!aStudent || !bStudent) continue;

              if (cached.genderAlternate) {
                const gA = cached.genderById.get(aId);
                const gB = cached.genderById.get(bId);
                if (gA && gB && gA === gB) n += genderPenalty;
              }

              const mergeFactor = Number.isFinite(mergeFactorRaw) ? mergeFactorRaw : 1;
              const alonePenalty = aloneNeighborPenalty * mergeFactor;
              if (studentById.get(aId)?.prefersAlone) n += alonePenalty;
              if (studentById.get(bId)?.prefersAlone) n += alonePenalty;
              const foesA = cached.foeSetById.get(aId);
              const foesB = cached.foeSetById.get(bId);
              const aFoeB = (foesA instanceof Set && foesA.has(bId));
              const bFoeA = (foesB instanceof Set && foesB.has(aId));
              if (aFoeB) n += 4 * mergeFactor;
              if (bFoeA) n += 4 * mergeFactor;
              if (aFoeB || bFoeA) {
                continue;
              }

              const aLikes = cached.buddySetById.get(aId)?.has(bId) || false;
              const bLikes = cached.buddySetById.get(bId)?.has(aId) || false;
              if (aLikes) n -= mergeFactor * buddyBonusOneWay;
              if (bLikes) n -= mergeFactor * buddyBonusOneWay;
            }

            for (const [sid, seatIdStr] of seatByStudent.entries()) {
              const buddies = cached.buddySetById.get(sid);
              if (buddies instanceof Set && buddies.size) {
                const a = cached.seatCoords.get(seatIdStr);
                if (a) {
                  for (const buddyId of buddies) {
                    const buddySeat = seatByStudent.get(buddyId);
                    if (!buddySeat) continue;
                    const b = cached.seatCoords.get(buddySeat);
                    if (!b) continue;
                    const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                    if (dist < 2 || dist > 3) continue;
                    const foesA = cached.foeSetById.get(sid);
                    const foesB = cached.foeSetById.get(buddyId);
                    const blocked = (foesA instanceof Set && foesA.has(buddyId))
                      || (foesB instanceof Set && foesB.has(sid));
                    if (blocked) continue;
                    const factor = foeDistanceEffectFactor(a, b, cached.activeHas);
                    n -= scaledBuddyDistance23(BUDDY_DISTANCE_BASE_BONUS_ONE_WAY, dist) * factor;
                  }
                }
              }

              const foes = cached.foeSetById.get(sid);
              if (!(foes instanceof Set) || !foes.size) continue;
              const a = cached.seatCoords.get(seatIdStr);
              if (!a) continue;
              for (const foeId of foes) {
                const foeSeat = seatByStudent.get(foeId);
                if (!foeSeat) continue;
                const b = cached.seatCoords.get(foeSeat);
                if (!b) continue;
                const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                const factor = foeDistanceEffectFactor(a, b, cached.activeHas);
                if (dist === 2) n += 1 * factor;
                else n += scaledDistance34(foeDistancePenalty, dist) * factor;
              }
            }

            return n;
          }

          function computeIndividualScoresForMap(map, activeIds, studentById, mergedPairs = new Set(), cache = null) {
            const scores = new Map();
            if (!(map instanceof Map)) return scores;
            const activeSet = new Set(activeIds);
            const cached = cache && cache.seatCoords && cache.adjacentPairs
              ? cache
              : createConflictCache(activeSet, studentById, mergedPairs, { activeIds });

            const seatByStudent = new Map();
            let teacherSeatId = null;
            for (const [seatIdStr, sid] of map) {
              if (sid === 'TEACHER') {
                teacherSeatId = seatIdStr;
              } else if (sid) {
                seatByStudent.set(sid, seatIdStr);
                scores.set(sid, 0);
              }
            }

            const teacherCoords = teacherSeatId ? cached.seatCoords.get(teacherSeatId) : null;
            const teacherRowIdx = (teacherCoords && cached.rowIndex.has(teacherCoords.r))
              ? cached.rowIndex.get(teacherCoords.r)
              : null;

            if (teacherRowIdx !== null && cached.teacherDistanceWanted && cached.teacherDistanceWanted.size) {
              cached.teacherDistanceWanted.forEach(studentId => {
                const seatIdStr = seatByStudent.get(studentId);
                if (!seatIdStr) return;
                const seatRowIdx = cached.seatRowIndex.get(seatIdStr);
                if (seatRowIdx === undefined) return;
                const dist = Math.abs(seatRowIdx - teacherRowIdx);
                let add = 0;
                if (dist >= 3) add = 3;
                else if (dist === 2) add = 1;
                if (add) scores.set(studentId, (scores.get(studentId) || 0) + add);
              });
            }

            const genderPenalty = 1;
            const buddyBonusOneWay = BUDDY_ADJACENT_BONUS_ONE_WAY;
            const aloneNeighborPenalty = ALONE_NEIGHBOR_PENALTY;

            for (let i = 0; i < cached.adjacentPairs.length; i++) {
              const [aSeat, bSeat, mergeFactorRaw] = cached.adjacentPairs[i];
              const aId = map.get(aSeat);
              const bId = map.get(bSeat);
              if (!aId || !bId) continue;
              if (aId === 'TEACHER' || bId === 'TEACHER') continue;

              const mergeFactor = Number.isFinite(mergeFactorRaw) ? mergeFactorRaw : 1;
              const alonePenalty = aloneNeighborPenalty * mergeFactor;
              if (studentById.get(aId)?.prefersAlone) {
                scores.set(aId, (scores.get(aId) || 0) + alonePenalty);
              }
              if (studentById.get(bId)?.prefersAlone) {
                scores.set(bId, (scores.get(bId) || 0) + alonePenalty);
              }

              if (cached.genderAlternate) {
                const gA = cached.genderById.get(aId);
                const gB = cached.genderById.get(bId);
                if (gA && gB && gA === gB) {
                  const add = genderPenalty / 2;
                  scores.set(aId, (scores.get(aId) || 0) + add);
                  scores.set(bId, (scores.get(bId) || 0) + add);
                }
              }

              const foesA = cached.foeSetById.get(aId);
              const foesB = cached.foeSetById.get(bId);
              const aFoeB = (foesA instanceof Set && foesA.has(bId));
              const bFoeA = (foesB instanceof Set && foesB.has(aId));
              if (aFoeB) {
                const add = 4 * mergeFactor;
                scores.set(aId, (scores.get(aId) || 0) + add);
              }
              if (bFoeA) {
                const add = 4 * mergeFactor;
                scores.set(bId, (scores.get(bId) || 0) + add);
              }
              if (aFoeB || bFoeA) {
                continue;
              }

              const aLikes = cached.buddySetById.get(aId)?.has(bId) || false;
              const bLikes = cached.buddySetById.get(bId)?.has(aId) || false;
              if (aLikes) {
                scores.set(aId, (scores.get(aId) || 0) - mergeFactor * buddyBonusOneWay);
              }
              if (bLikes) {
                scores.set(bId, (scores.get(bId) || 0) - mergeFactor * buddyBonusOneWay);
              }
            }

            for (const [sid, seatIdStr] of seatByStudent.entries()) {
              const buddies = cached.buddySetById.get(sid);
              if (buddies instanceof Set && buddies.size) {
                const a = cached.seatCoords.get(seatIdStr);
                if (a) {
                  for (const buddyId of buddies) {
                    if (!buddyId) continue;
                    const buddySeat = seatByStudent.get(buddyId);
                    if (!buddySeat) continue;
                    const b = cached.seatCoords.get(buddySeat);
                    if (!b) continue;
                    const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                    if (dist < 2 || dist > 3) continue;
                    const foesA = cached.foeSetById.get(sid);
                    const foesB = cached.foeSetById.get(buddyId);
                    const blocked = (foesA instanceof Set && foesA.has(buddyId))
                      || (foesB instanceof Set && foesB.has(sid));
                    if (blocked) continue;
                    const factor = foeDistanceEffectFactor(a, b, cached.activeHas);
                    const add = scaledBuddyDistance23(BUDDY_DISTANCE_BASE_BONUS_ONE_WAY, dist) * factor;
                    if (add) {
                      scores.set(sid, (scores.get(sid) || 0) - add);
                    }
                  }
                }
              }

              const foes = cached.foeSetById.get(sid);
              if (!(foes instanceof Set) || !foes.size) continue;
              const a = cached.seatCoords.get(seatIdStr);
              if (!a) continue;
              for (const foeId of foes) {
                if (!foeId) continue;
                const foeSeat = seatByStudent.get(foeId);
                if (!foeSeat) continue;
                const b = cached.seatCoords.get(foeSeat);
                if (!b) continue;
                const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                const factor = foeDistanceEffectFactor(a, b, cached.activeHas);
                let add = 0;
                if (dist === 2) add = 1 * factor;
                else add = scaledDistance34(0.2, dist) * factor;
                if (add) {
                  scores.set(sid, (scores.get(sid) || 0) + add);
                }
              }
            }

            return scores;
          }

          function cloneSeatMap(map) {
            const next = new Map();
            map.forEach((val, key) => { next.set(key, val); });
            return next;
          }

          function createSeededRandom(seed) {
            let h = seed >>> 0;
            return function () {
              h = Math.imul(h ^ (h >>> 15), 1 | h);
              h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
              return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
            };
          }

          function shuffleInPlace(arr, rng) {
            const randomFn = (typeof rng === 'function') ? rng : Math.random;
            for (let i = arr.length - 1; i > 0; i--) {
              const j = Math.floor(randomFn() * (i + 1));
              if (j !== i) {
                const tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
              }
            }
            return arr;
          }

          function randomizeSeatMap(map, mutableSeats, rng) {
            const next = cloneSeatMap(map);
            const seatCount = Array.isArray(mutableSeats) ? mutableSeats.length : 0;
            if (!seatCount) return next;
            const pool = [];
            for (let i = 0; i < seatCount; i++) {
              const seatId = mutableSeats[i];
              const sid = next.get(seatId);
              if (sid && sid !== 'TEACHER') pool.push(sid);
              next.set(seatId, null);
            }
            const seats = mutableSeats.slice();
            shuffleInPlace(pool, rng);
            shuffleInPlace(seats, rng);
            const len = Math.min(pool.length, seats.length);
            for (let i = 0; i < len; i++) {
              next.set(seats[i], pool[i]);
            }
            return next;
          }

          function perturbSeatMap(map, seats, rng, swaps = 20) {
            const next = cloneSeatMap(map);
            const seatCount = Array.isArray(seats) ? seats.length : 0;
            if (seatCount < 2) return next;
            const randomFn = (typeof rng === 'function') ? rng : Math.random;
            const k = Math.max(1, Math.floor(swaps));
            for (let i = 0; i < k; i++) {
              const aIdx = Math.floor(randomFn() * seatCount);
              let bIdx = Math.floor(randomFn() * seatCount);
              if (bIdx === aIdx) { bIdx = (bIdx + 1) % seatCount; }
              const seatA = seats[aIdx];
              const seatB = seats[bIdx];
              const aVal = next.get(seatA);
              const bVal = next.get(seatB);
              next.set(seatA, bVal || null);
              next.set(seatB, aVal || null);
            }
            return next;
          }

          function optimizeSeatMapWithAnnealing(initialMap, activeIds, studentById, lockedSeatIds = new Set(), options = {}) {
            const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const timeLimitMs = Math.max(50, options.timeLimitMs || 4000);
            const progressCb = (typeof options.onProgress === 'function') ? options.onProgress : null;
            const randomFn = (typeof options.randomFn === 'function') ? options.randomFn : Math.random;
            const startTs = nowMs();
            const activeSet = new Set(activeIds);
            const mergedPairs = state.mergedPairs || new Set();
            const teacherDistanceMap = getTeacherDistanceMap();
            const teacherDistanceWanted = new Set(Array.from(teacherDistanceMap.keys()));
            const genderAlternate = !!state.conditions?.genderAlternation;
            const conflictCache = createConflictCache(activeSet, studentById, mergedPairs, {
              activeIds,
              genderAlternate,
              teacherDistanceMap,
              teacherDistanceWanted,
            });
            const costOf = (map) => countConflicts(map, activeSet, studentById, mergedPairs, conflictCache);
            let current = cloneSeatMap(initialMap);
            let currentCost = costOf(current);
            let best = cloneSeatMap(current);
            let bestCost = currentCost;
            const mutableSeats = activeIds.filter(id => !lockedSeatIds.has(id));
            const mutableSeatSet = new Set(mutableSeats);
            if (mutableSeats.length < 2) {
              if (progressCb) progressCb(1, 0, bestCost, true);
              return { map: current, bestCost: bestCost, timeLimitHit: false, elapsedMs: 0 };
            }
            const seatCoords = conflictCache.seatCoords;
            const neighborMap = new Map();
            activeIds.forEach(seatId => {
              const coords = seatCoords.get(seatId);
              if (!coords) return;
              const { r, c } = coords;
              const cand = [`${r - 1}-${c}`, `${r + 1}-${c}`, `${r}-${c - 1}`, `${r}-${c + 1}`];
              neighborMap.set(seatId, cand.filter(n => activeSet.has(n)));
            });
            const maxSeatDegree = Math.max(0, ...mutableSeats.map(id => (neighborMap.get(id) || []).length));
            const teacherSeatId = [...initialMap.entries()].find(([, val]) => val === 'TEACHER')?.[0] || null;
            const teacherCoords = teacherSeatId ? seatCoords.get(teacherSeatId) : null;
            const teacherRowIdx = (teacherCoords && conflictCache.rowIndex.has(teacherCoords.r))
              ? conflictCache.rowIndex.get(teacherCoords.r)
              : null;

            const startTemp = Math.max(2.5, (mutableSeats.length / 2));
            const endTemp = 0.1;
            let timeLimitHit = false;
            let lastProgressTs = startTs;
            let lastBestTs = startTs;
            let iter = 0;
            let occupiedMutable = [];
            let hotPool = [];

            const refreshHotPool = () => {
              occupiedMutable = mutableSeats.filter(id => current.get(id));
              const weights = new Map();
              const bump = (seatId, w) => {
                if (!seatId || lockedSeatIds.has(seatId)) return;
                weights.set(seatId, (weights.get(seatId) || 0) + w);
              };
              const seatByStudent = new Map();
              current.forEach((sid, seatId) => {
                if (sid && sid !== 'TEACHER') seatByStudent.set(sid, seatId);
              });
              current.forEach((sid, seatId) => {
                if (!sid || sid === 'TEACHER') return;
                const student = studentById.get(sid);
                if (!student) return;

                if (teacherSeatId && teacherRowIdx !== null && teacherDistanceWanted.has(sid)) {
                  const seatRowIdx = conflictCache.seatRowIndex.get(seatId);
                  if (seatRowIdx !== undefined) {
                    const dist = Math.abs(seatRowIdx - teacherRowIdx);
                    if (dist >= 3) bump(seatId, 5);
                    else if (dist === 2) bump(seatId, 2);
                  }
                }

                const neighbors = neighborMap.get(seatId) || [];
                for (const nb of neighbors) {
                  const occ = current.get(nb);
                  if (!occ || occ === 'TEACHER') continue;
                  const other = studentById.get(occ);
                  if (!other) continue;
                  const mergedKey = pairKey(seatId, nb);
                  const mergeFactor = mergedKey && mergedPairs instanceof Set && mergedPairs.has(mergedKey) ? 2 : 1;
                  if (hasFoePreference(student, occ)) {
                    bump(seatId, 6 * mergeFactor);
                  }
                  if (hasFoePreference(other, sid)) {
                    bump(nb, 6 * mergeFactor);
                  } else if (genderAlternate) {
                    const gA = genderCode(student);
                    const gB = genderCode(other);
                    if (gA && gB && gA === gB) {
                      bump(seatId, 1);
                      bump(nb, 1);
                    }
                  }
                }

                const foes = Array.isArray(student.foes) ? student.foes : [];
                for (const foeId of foes) {
                  const otherSeat = seatByStudent.get(foeId);
                  if (!otherSeat) continue;
                  const a = seatCoords.get(seatId);
                  const b = seatCoords.get(otherSeat);
                  if (!a || !b) continue;
                  const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                  if (dist > 0 && dist < 3) {
                    bump(seatId, 1);
                    bump(otherSeat, 1);
                  }
                }
              });

              hotPool = [];
              weights.forEach((w, seatId) => {
                const repeats = Math.min(12, Math.max(1, Math.round(w)));
                for (let i = 0; i < repeats; i++) hotPool.push(seatId);
              });
              if (!hotPool.length) {
                hotPool = occupiedMutable.slice();
              }
            };

            refreshHotPool();

            while (true) {
              const now = nowMs();
              const elapsed = now - startTs;
              if (elapsed >= timeLimitMs) {
                timeLimitHit = true;
                break;
              }
              iter++;

              if (progressCb && (now - lastProgressTs) >= 120) {
                const pct = Math.min(1, elapsed / timeLimitMs);
                progressCb(pct, elapsed, bestCost);
                lastProgressTs = now;
              }

              if (iter % 180 === 0) {
                refreshHotPool();
              }

              if (!occupiedMutable.length) break;

              const t = Math.min(1, elapsed / timeLimitMs);
              const temp = startTemp * Math.pow(endTemp / startTemp, t);

              const pickFromHot = hotPool.length && randomFn() < 0.85;
              const pool = pickFromHot ? hotPool : occupiedMutable;
              const seatA = pool[Math.floor(randomFn() * pool.length)];
              if (!seatA) continue;

              let seatB = null;
              if (randomFn() < 0.65) {
                const nbs = neighborMap.get(seatA) || [];
                if (nbs.length) {
                  const candidates = nbs.filter(nb => mutableSeatSet.has(nb));
                  if (candidates.length) {
                    seatB = candidates[Math.floor(randomFn() * candidates.length)];
                  }
                }
              }
              if (!seatB) {
                const poolB = (hotPool.length && randomFn() < 0.35) ? hotPool : mutableSeats;
                seatB = poolB[Math.floor(randomFn() * poolB.length)];
              }
              if (!seatB || seatB === seatA) continue;

              const aVal = current.get(seatA);
              const bVal = current.get(seatB);
              if (!aVal && !bVal) continue;

              current.set(seatA, bVal || null);
              current.set(seatB, aVal || null);
              const newCost = costOf(current);
              const delta = newCost - currentCost;
              const accept = delta <= 0 || randomFn() < Math.exp(-delta / Math.max(temp, 0.001));

              if (accept) {
                currentCost = newCost;
                if (newCost < bestCost) {
                  best = cloneSeatMap(current);
                  bestCost = newCost;
                  lastBestTs = now;
                }
              } else {
                current.set(seatA, aVal || null);
                current.set(seatB, bVal || null);
              }

              const stalledLong = (now - lastBestTs) >= Math.max(350, timeLimitMs * 0.35);
              const lateInRun = elapsed >= (timeLimitMs * 0.65);
              if (stalledLong && lateInRun && maxSeatDegree > 0) {
                current = perturbSeatMap(best, mutableSeats, randomFn, Math.max(6, Math.floor(mutableSeats.length / 2)));
                currentCost = costOf(current);
                lastBestTs = now;
                refreshHotPool();
              }
            }
            const totalElapsed = nowMs() - startTs;
            if (progressCb) progressCb(1, totalElapsed, bestCost, true);
            return { map: best, bestCost, timeLimitHit, elapsedMs: totalElapsed };
          }

          function exactOptimizeSeatMap(initialMap, activeIds, studentById, lockedSeatIds = new Set(), options = {}) {
            const nowMs = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const timeLimitMs = Math.max(50, options.timeLimitMs || 4000);
            const progressCb = (typeof options.onProgress === 'function') ? options.onProgress : null;
            const startTs = nowMs();
            const activeSet = new Set(activeIds);
            const mergedPairs = state.mergedPairs || new Set();
            const teacherDistanceMap = getTeacherDistanceMap();
            const teacherDistanceWanted = new Set(Array.from(teacherDistanceMap.keys()));
            const genderAlternate = !!state.conditions?.genderAlternation;
            const conflictCache = createConflictCache(activeSet, studentById, mergedPairs, {
              activeIds,
              genderAlternate,
              teacherDistanceMap,
              teacherDistanceWanted,
            });
            const mutableSeats = activeIds.filter(id => !lockedSeatIds.has(id));
            const studentsToPlace = Array.from(initialMap.entries())
              .filter(([, sid]) => sid && sid !== 'TEACHER')
              .map(([, sid]) => sid)
              .filter(sid => {
                const seatOf = [...initialMap.entries()].find(([seatId, val]) => val === sid);
                if (!seatOf) return true;
                return !lockedSeatIds.has(seatOf[0]);
              });
            const uniqueStudents = Array.from(new Set(studentsToPlace));
            if (!uniqueStudents.length || !mutableSeats.length) {
              const bestCost = countConflicts(initialMap, activeSet, studentById, mergedPairs, conflictCache);
              if (progressCb) progressCb(1, 0, bestCost, true);
              return { map: initialMap, bestCost, timeLimitHit: false, elapsedMs: 0 };
            }
            uniqueStudents.sort((a, b) => {
              const sa = studentById.get(a) || {};
              const sb = studentById.get(b) || {};
              const aFront = teacherDistanceWanted.has(a) ? 1 : 0;
              const bFront = teacherDistanceWanted.has(b) ? 1 : 0;
              if (aFront !== bFront) return bFront - aFront;
              const degA = (sa.foes?.length || 0) * 2 + buddyCount(sa);
              const degB = (sb.foes?.length || 0) * 2 + buddyCount(sb);
              return degB - degA;
            });
            const variableStudentSet = new Set(uniqueStudents);
            const fixedStudentIds = new Set();
            initialMap.forEach((sid) => {
              if (!sid || sid === 'TEACHER') return;
              if (!variableStudentSet.has(sid)) fixedStudentIds.add(sid);
            });

            const seatCoords = conflictCache.seatCoords;
            const neighborMap = new Map();
            activeIds.forEach(seatId => {
              const coords = seatCoords.get(seatId);
              if (!coords) return;
              const { r, c } = coords;
              const cand = [`${r - 1}-${c}`, `${r + 1}-${c}`, `${r}-${c - 1}`, `${r}-${c + 1}`];
              neighborMap.set(seatId, cand.filter(n => activeSet.has(n)));
            });
            const maxSeatDegree = Math.max(0, ...mutableSeats.map(id => (neighborMap.get(id) || []).length));
            const teacherSeatId = [...initialMap.entries()].find(([, val]) => val === 'TEACHER')?.[0] || null;
            const teacherRow = teacherSeatId ? parseInt(teacherSeatId.split('-')[0], 10) : null;
            const activeRows = getActiveRows(activeSet);
            const seatTeacherDist = new Map();
            if (teacherRow !== null) {
              activeIds.forEach(seatId => {
                const coords = seatCoords.get(seatId);
                const row = coords?.r ?? parseInt(String(seatId).split('-')[0], 10);
                if (!Number.isFinite(row)) return;
                seatTeacherDist.set(seatId, activeRowDistance(activeRows, teacherRow, row));
              });
            }

            const maxMergeFactor = 2;
            const buddyBonusOneWay = BUDDY_ADJACENT_BONUS_ONE_WAY;
            const maxEdgeBonus = maxMergeFactor * buddyBonusOneWay * 2;

            const pairBonusUpper = (aId, bId) => {
              const a = studentById.get(aId);
              const b = studentById.get(bId);
              if (!a || !b) return 0;
              if (hasFoePreference(a, bId) || hasFoePreference(b, aId)) return 0;
              const aLikesB = hasBuddyPreference(a, bId);
              const bLikesA = hasBuddyPreference(b, aId);
              if (!aLikesB && !bLikesA) return 0;
              let base = 0;
              if (aLikesB) base += buddyBonusOneWay;
              if (bLikesA) base += buddyBonusOneWay;
              return maxMergeFactor * base;
            };

            const varVarPlacedBonusPrefix = new Array(uniqueStudents.length + 1).fill(0);
            for (let placedCount = 1; placedCount <= uniqueStudents.length; placedCount++) {
              const newStudent = uniqueStudents[placedCount - 1];
              let add = 0;
              for (let j = 0; j < placedCount - 1; j++) {
                add += pairBonusUpper(newStudent, uniqueStudents[j]);
              }
              varVarPlacedBonusPrefix[placedCount] = varVarPlacedBonusPrefix[placedCount - 1] + add;
            }
            const varVarTotalBonusUpper = varVarPlacedBonusPrefix[uniqueStudents.length];

            const varFixedBonusByVar = uniqueStudents.map(varId => {
              let sum = 0;
              fixedStudentIds.forEach(fixedId => { sum += pairBonusUpper(varId, fixedId); });
              return sum;
            });
            const varFixedBonusSuffix = new Array(uniqueStudents.length + 1).fill(0);
            for (let i = uniqueStudents.length - 1; i >= 0; i--) {
              varFixedBonusSuffix[i] = varFixedBonusSuffix[i + 1] + varFixedBonusByVar[i];
            }

            const remainingBuddyBonusUpperBound = (placedCount, availableSeatsSet) => {
              const remainingStudents = uniqueStudents.length - placedCount;
              if (remainingStudents <= 0) return 0;

              const varVarRemainingUpper = varVarTotalBonusUpper - varVarPlacedBonusPrefix[placedCount];
              const varFixedRemainingUpper = varFixedBonusSuffix[placedCount];
              const pairUpper = varVarRemainingUpper + varFixedRemainingUpper;

              if (!availableSeatsSet || typeof availableSeatsSet.forEach !== 'function') return pairUpper;

              let edgePotential = 0;
              availableSeatsSet.forEach(seatId => {
                const neighbors = neighborMap.get(seatId) || [];
                for (const nb of neighbors) {
                  if (availableSeatsSet.has(nb)) {
                    if (String(seatId) < String(nb)) edgePotential += 1;
                  } else {
                    edgePotential += 1;
                  }
                }
              });
              const edgesByStudents = remainingStudents * maxSeatDegree;
              const edgeUpper = Math.min(edgePotential, edgesByStudents);
              const seatUpper = edgeUpper * maxEdgeBonus;

              return Math.min(pairUpper, seatUpper);
            };

            const best = { cost: Infinity, map: initialMap };
            const currentMap = cloneSeatMap(initialMap);
            const assignSeat = (seatId, studentId) => { currentMap.set(seatId, studentId); };
            const freeSeat = (seatId) => { currentMap.set(seatId, null); };
            const availableSeats = new Set(mutableSeats);
            uniqueStudents.forEach(sid => {
              const entry = [...currentMap.entries()].find(([, val]) => val === sid);
              if (entry && !lockedSeatIds.has(entry[0])) {
                freeSeat(entry[0]);
              }
            });

            let nodes = 0;
            const recurse = (idx) => {
              nodes++;
              const now = nowMs();
              const elapsed = now - startTs;
              if (elapsed >= timeLimitMs) return true;
              if (progressCb && nodes % 200 === 0) {
                const pct = Math.min(1, elapsed / timeLimitMs);
                progressCb(pct, elapsed, best.cost);
              }
              if (idx >= uniqueStudents.length) {
                const cost = countConflicts(currentMap, activeSet, studentById, mergedPairs, conflictCache);
                if (cost < best.cost) {
                  best.cost = cost;
                  best.map = cloneSeatMap(currentMap);
                }
                return false;
              }
              const studentId = uniqueStudents[idx];
              const wantsFront = teacherDistanceWanted.has(studentId);
              const seatsSnapshot = Array.from(availableSeats).sort((a, b) => {
                if (wantsFront && teacherRow !== null) {
                  const rawA = seatTeacherDist.get(a);
                  const rawB = seatTeacherDist.get(b);
                  const distA = Number.isFinite(rawA) ? rawA : null;
                  const distB = Number.isFinite(rawB) ? rawB : null;
                  if (distA !== null && distB !== null && distA !== distB) return distA - distB;
                  if (distA === null && distB !== null) return 1;
                  if (distA !== null && distB === null) return -1;
                }
                const degA = (neighborMap.get(a) || []).length;
                const degB = (neighborMap.get(b) || []).length;
                return degA - degB;
              });
              for (const seatId of seatsSnapshot) {
                assignSeat(seatId, studentId);
                availableSeats.delete(seatId);
                const partialCost = countConflicts(currentMap, activeSet, studentById, mergedPairs, conflictCache);
                const placedCount = idx + 1;
                const optimisticLowerBound = partialCost - remainingBuddyBonusUpperBound(placedCount, availableSeats);
                if (optimisticLowerBound < best.cost) {
                  const abort = recurse(idx + 1);
                  if (abort) return true;
                }
                freeSeat(seatId);
                availableSeats.add(seatId);
              }
              return false;
            };
            const timeLimitHit = recurse(0);
            const elapsedMs = nowMs() - startTs;
            if (progressCb) progressCb(1, elapsedMs, best.cost, true);
            return { map: best.map, bestCost: best.cost, timeLimitHit, elapsedMs };
          }

          function improveSeatMapWithBestSwaps(initialMap, activeIds, studentById, lockedSeatIds = new Set(), options = {}) {
            const startTs = nowMs();
            const timeLimitMs = Number.isFinite(options.timeLimitMs) ? Math.max(0, options.timeLimitMs) : null;
            const deadlineTs = timeLimitMs === null ? null : (startTs + timeLimitMs);
            const shouldStop = () => (deadlineTs !== null) && nowMs() >= deadlineTs;

            const activeSet = new Set(activeIds);
            const mergedPairs = state.mergedPairs || new Set();
            const teacherDistanceMap = getTeacherDistanceMap();
            const teacherDistanceWanted = new Set(Array.from(teacherDistanceMap.keys()));
            const genderAlternate = !!state.conditions?.genderAlternation;
            const conflictCache = createConflictCache(activeSet, studentById, mergedPairs, {
              activeIds,
              genderAlternate,
              teacherDistanceMap,
              teacherDistanceWanted,
            });
            const costOf = (map) => countConflicts(map, activeSet, studentById, mergedPairs, conflictCache);
            const seatSorter = (a, b) => {
              const [ar, ac] = String(a).split('-').map(Number);
              const [br, bc] = String(b).split('-').map(Number);
              if (ar === br) return (ac || 0) - (bc || 0);
              return (ar || 0) - (br || 0);
            };
            const mutableSeats = activeIds.filter(id => !lockedSeatIds.has(id)).sort(seatSorter);
            const pairCount = (mutableSeats.length * (mutableSeats.length - 1)) / 2;

            const maxPasses = Number.isInteger(options.maxPasses) ? Math.max(1, options.maxPasses) : 10;
            const fullPairLimit = Number.isInteger(options.fullPairLimit) ? Math.max(0, options.fullPairLimit) : 6000;
            const maxFocusSeats = Number.isInteger(options.maxFocusSeats) ? Math.max(4, options.maxFocusSeats) : 24;
            const EPS = 1e-9;

            if (mutableSeats.length < 2) {
              const bestCost = costOf(initialMap);
              return { map: cloneSeatMap(initialMap), bestCost, passes: 0, evaluations: 0, timeLimitHit: false, elapsedMs: 0 };
            }

            const seatCoords = conflictCache.seatCoords;
            const neighborMap = new Map();
            activeIds.forEach(seatId => {
              const coords = seatCoords.get(seatId);
              if (!coords) return;
              const { r, c } = coords;
              const cand = [`${r - 1}-${c}`, `${r + 1}-${c}`, `${r}-${c - 1}`, `${r}-${c + 1}`];
              neighborMap.set(seatId, cand.filter(n => activeSet.has(n)));
            });

            const teacherSeatId = [...initialMap.entries()].find(([, val]) => val === 'TEACHER')?.[0] || null;
            const teacherCoords = teacherSeatId ? seatCoords.get(teacherSeatId) : null;
            const teacherRowIdx = (teacherCoords && conflictCache.rowIndex.has(teacherCoords.r))
              ? conflictCache.rowIndex.get(teacherCoords.r)
              : null;

            const computeFocusSet = (currentMap) => {
              if (pairCount <= fullPairLimit) return null;
              const seatByStudent = new Map();
              currentMap.forEach((sid, seatId) => {
                if (sid && sid !== 'TEACHER') seatByStudent.set(sid, seatId);
              });
              const weight = new Map();
              mutableSeats.forEach(seatId => weight.set(seatId, 0));
              const bump = (seatId, w) => {
                if (!seatId || !weight.has(seatId)) return;
                weight.set(seatId, (weight.get(seatId) || 0) + w);
              };

              mutableSeats.forEach(seatId => {
                const sid = currentMap.get(seatId);
                if (!sid || sid === 'TEACHER') return;
                const student = studentById.get(sid);
                if (!student) return;

                const deg = ((student.foes?.length || 0) * 2) + buddyCount(student);
                if (deg) bump(seatId, deg * 0.05);

                if (teacherSeatId && teacherRowIdx !== null && teacherDistanceWanted.has(sid)) {
                  const seatRowIdx = conflictCache.seatRowIndex.get(seatId);
                  if (seatRowIdx !== undefined) {
                    const dist = Math.abs(seatRowIdx - teacherRowIdx);
                    if (dist >= 3) bump(seatId, 5);
                    else if (dist === 2) bump(seatId, 2);
                  }
                }

                const neighbors = neighborMap.get(seatId) || [];
                for (const nb of neighbors) {
                  const occ = currentMap.get(nb);
                  if (!occ || occ === 'TEACHER') continue;
                  const other = studentById.get(occ);
                  if (!other) continue;
                  const mergedKey = pairKey(seatId, nb);
                  const mergeFactor = mergedKey && mergedPairs instanceof Set && mergedPairs.has(mergedKey) ? 2 : 1;
                  if (hasFoePreference(student, occ)) {
                    bump(seatId, 6 * mergeFactor);
                  } else if (genderAlternate) {
                    const gA = genderCode(student);
                    const gB = genderCode(other);
                    if (gA && gB && gA === gB) {
                      bump(seatId, 1);
                    }
                  }
                  if (buddyCount(student)) {
                    const aLikesB = hasBuddyPreference(student, occ);
                    if (aLikesB && !hasFoePreference(student, occ)) {
                      bump(seatId, BUDDY_ADJACENT_BONUS_ONE_WAY);
                    }
                  }
                  if (buddyCount(other)) {
                    const bLikesA = hasBuddyPreference(other, sid);
                    if (bLikesA && !hasFoePreference(other, sid)) {
                      bump(nb, BUDDY_ADJACENT_BONUS_ONE_WAY);
                    }
                  }
                }

                const foes = Array.isArray(student.foes) ? student.foes : [];
                for (const foeId of foes) {
                  const otherSeat = seatByStudent.get(foeId);
                  if (!otherSeat) continue;
                  const a = seatCoords.get(seatId);
                  const b = seatCoords.get(otherSeat);
                  if (!a || !b) continue;
                  const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                  if (dist > 0 && dist < 3) bump(seatId, 1);
                  else if (dist < 5) bump(seatId, 0.35);
                }
              });

              const focusCount = Math.min(
                maxFocusSeats,
                Math.max(12, Math.ceil(Math.sqrt(mutableSeats.length) * 3))
              );
              const ranked = Array.from(weight.entries()).sort((a, b) => {
                const dw = (b[1] || 0) - (a[1] || 0);
                if (Math.abs(dw) > EPS) return dw;
                return seatSorter(a[0], b[0]);
              });
              const picked = ranked.slice(0, focusCount).map(([seatId]) => seatId);
              return new Set(picked);
            };

            let current = cloneSeatMap(initialMap);
            let currentCost = costOf(current);
            let evaluations = 0;
            let passes = 0;
            let timeLimitHit = false;

            while (passes < maxPasses) {
              if (shouldStop()) { timeLimitHit = true; break; }
              const focusSet = computeFocusSet(current);
              let bestDelta = 0;
              let bestI = -1;
              let bestJ = -1;
              let bestNewCost = currentCost;
              let stop = false;

              for (let i = 0; i < mutableSeats.length; i++) {
                const seatA = mutableSeats[i];
                const aVal = current.get(seatA) || null;
                for (let j = i + 1; j < mutableSeats.length; j++) {
                  const seatB = mutableSeats[j];
                  if (focusSet && !(focusSet.has(seatA) || focusSet.has(seatB))) continue;

                  const bVal = current.get(seatB) || null;
                  if (!aVal && !bVal) continue;
                  if (aVal === 'TEACHER' || bVal === 'TEACHER') continue;

                  if (evaluations % 120 === 0 && shouldStop()) { timeLimitHit = true; stop = true; break; }
                  current.set(seatA, bVal);
                  current.set(seatB, aVal);
                  const newCost = costOf(current);
                  current.set(seatA, aVal);
                  current.set(seatB, bVal);
                  evaluations++;

                  const delta = newCost - currentCost;
                  if (delta < bestDelta - EPS) {
                    bestDelta = delta;
                    bestI = i;
                    bestJ = j;
                    bestNewCost = newCost;
                  } else if (bestI !== -1 && Math.abs(delta - bestDelta) <= EPS) {
                    if (i < bestI || (i === bestI && j < bestJ)) {
                      bestI = i;
                      bestJ = j;
                      bestNewCost = newCost;
                    }
                  }
                }
                if (stop) break;
              }

              if (bestI === -1 || bestDelta > -EPS) break;
              const seatA = mutableSeats[bestI];
              const seatB = mutableSeats[bestJ];
              const aVal = current.get(seatA) || null;
              const bVal = current.get(seatB) || null;
              current.set(seatA, bVal);
              current.set(seatB, aVal);
              currentCost = bestNewCost;
              passes++;
            }

            const elapsedMs = nowMs() - startTs;
            return { map: current, bestCost: currentCost, passes, evaluations, timeLimitHit, elapsedMs };
          }

          function improveSeatMapWithWorstStudents(initialMap, activeIds, studentById, lockedSeatIds = new Set(), options = {}) {
            const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const startTs = now();
            const timeLimitMs = Number.isFinite(options.timeLimitMs) ? Math.max(0, options.timeLimitMs) : null;
            const deadlineTs = timeLimitMs === null ? null : (startTs + timeLimitMs);
            const shouldStop = () => (deadlineTs !== null) && now() >= deadlineTs;

            const activeSet = new Set(activeIds);
            const mergedPairs = state.mergedPairs || new Set();
            const teacherDistanceMap = getTeacherDistanceMap();
            const teacherDistanceWanted = new Set(Array.from(teacherDistanceMap.keys()));
            const genderAlternate = !!state.conditions?.genderAlternation;
            const conflictCache = createConflictCache(activeSet, studentById, mergedPairs, {
              activeIds,
              genderAlternate,
              teacherDistanceMap,
              teacherDistanceWanted,
            });

            const costOf = (map) => countConflicts(map, activeSet, studentById, mergedPairs, conflictCache);
            const current = cloneSeatMap(initialMap);
            let currentCost = costOf(current);

            const mutableSeats = activeIds.filter(id => !lockedSeatIds.has(id));
            if (mutableSeats.length < 2) {
              return { map: current, bestCost: currentCost, swaps: 0, rounds: 0, timeLimitHit: false, elapsedMs: 0 };
            }

            const maxRounds = Number.isInteger(options.maxRounds) ? Math.max(1, options.maxRounds) : 4;
            const maxStudents = Number.isInteger(options.maxStudents) ? Math.max(1, options.maxStudents) : Math.min(5, Math.ceil(mutableSeats.length / 3));
            const EPS = 1e-9;

            let swaps = 0;
            let rounds = 0;
            let timeLimitHit = false;

            while (rounds < maxRounds) {
              if (shouldStop()) { timeLimitHit = true; break; }

              const scoreMap = computeIndividualScoresForMap(current, activeIds, studentById, mergedPairs, conflictCache);
              const worst = Array.from(scoreMap.entries())
                .sort((a, b) => (b[1] || 0) - (a[1] || 0))
                .slice(0, maxStudents)
                .map(([sid]) => sid);

              if (!worst.length) break;

              let bestDelta = 0;
              let bestSwap = null;

              for (let wi = 0; wi < worst.length; wi++) {
                if (shouldStop()) { timeLimitHit = true; break; }
                const sid = worst[wi];
                const seatA = [...current.entries()].find(([, val]) => val === sid)?.[0];
                if (!seatA) continue;

                for (let j = 0; j < mutableSeats.length; j++) {
                  if (shouldStop()) { timeLimitHit = true; break; }
                  const seatB = mutableSeats[j];
                  if (seatB === seatA) continue;
                  const aVal = current.get(seatA) || null;
                  const bVal = current.get(seatB) || null;
                  if (bVal === 'TEACHER') continue;

                  current.set(seatA, bVal);
                  current.set(seatB, aVal);
                  const newCost = costOf(current);
                  current.set(seatA, aVal);
                  current.set(seatB, bVal);

                  const delta = newCost - currentCost;
                  if (delta < bestDelta - EPS) {
                    bestDelta = delta;
                    bestSwap = { seatA, seatB, newCost };
                  }
                }
                if (timeLimitHit) break;
              }

              if (!bestSwap) break;
              const aVal = current.get(bestSwap.seatA) || null;
              const bVal = current.get(bestSwap.seatB) || null;
              current.set(bestSwap.seatA, bVal);
              current.set(bestSwap.seatB, aVal);
              currentCost = bestSwap.newCost;
              swaps++;
              rounds++;
            }

            const elapsedMs = now() - startTs;
            return { map: current, bestCost: currentCost, swaps, rounds, timeLimitHit, elapsedMs };
          }

          els.templateLink?.addEventListener('click', (e) => {
            e.preventDefault();
            downloadCsvTemplate();
          });

          els.file.addEventListener('change', async (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) {
              state.csvName = '';
              updateCsvStatusDisplay();
              return;
            }
            try {
              await importCsvFromFile(f);
            } catch (err) {
              console.error(err);
              showMessage(err?.message || 'Namensliste konnte nicht geladen werden.', 'error');
            }
          });

          const isEventInsideCsvDropZone = (event) => {
            const target = event?.target;
            if (!(target instanceof Element)) return false;
            return Boolean(target.closest('#csv-drop-zone'));
          };
          const isEventInsideMergerDropZone = (event) => {
            const target = event?.target;
            if (!(target instanceof Element)) return false;
            return Boolean(target.closest('#merger-host') || target.closest('#dropZone'));
          };

          if (els.csvDropZone) {
            let csvDragDepth = 0;
            const clearCsvDragState = () => {
              csvDragDepth = 0;
              els.csvDropZone.classList.remove('drag-over-file');
            };
            els.csvDropZone.addEventListener('dragenter', (e) => {
              if (!dataTransferHasFiles(e.dataTransfer)) return;
              e.preventDefault();
              csvDragDepth += 1;
              els.csvDropZone.classList.add('drag-over-file');
            });
            els.csvDropZone.addEventListener('dragover', (e) => {
              if (!dataTransferHasFiles(e.dataTransfer)) return;
              e.preventDefault();
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
              }
              els.csvDropZone.classList.add('drag-over-file');
            });
            els.csvDropZone.addEventListener('dragleave', (e) => {
              e.preventDefault();
              csvDragDepth = Math.max(0, csvDragDepth - 1);
              if (csvDragDepth === 0) {
                els.csvDropZone.classList.remove('drag-over-file');
              }
            });
            els.csvDropZone.addEventListener('drop', async (e) => {
              if (!dataTransferHasFiles(e.dataTransfer)) return;
              e.preventDefault();
              e.stopPropagation();
              clearCsvDragState();
              const droppedFiles = Array.from(e.dataTransfer?.files || []);
              const csvFile = droppedFiles.find(isCsvFile);
              if (!csvFile) {
                showMessage('Bitte hier eine CSV-Datei ablegen.', 'warn');
                return;
              }
              try {
                await importCsvFromFile(csvFile);
              } catch (err) {
                console.error(err);
                showMessage(err?.message || 'Namensliste konnte nicht geladen werden.', 'error');
              }
            });
            document.addEventListener('drop', clearCsvDragState);
            document.addEventListener('dragend', clearCsvDragState);
          }

          document.addEventListener('dragover', (e) => {
            if (!dataTransferHasFiles(e.dataTransfer)) return;
            if (isEventInsideCsvDropZone(e)) return;
            if (isEventInsideMergerDropZone(e)) return;
            e.preventDefault();
            if (e.dataTransfer) {
              e.dataTransfer.dropEffect = 'copy';
            }
          });

          document.addEventListener('drop', async (e) => {
            if (!dataTransferHasFiles(e.dataTransfer)) return;
            if (isEventInsideCsvDropZone(e)) return;
            if (isEventInsideMergerDropZone(e)) return;
            e.preventDefault();
            const droppedFiles = Array.from(e.dataTransfer?.files || []);
            const jsonFile = droppedFiles.find(isJsonFile);
            if (!jsonFile) {
              const csvFile = droppedFiles.find(isCsvFile);
              if (csvFile) {
                showMessage('CSV bitte im Feld „Namensliste auswählen“ ablegen.', 'warn');
              } else {
                showMessage('Hier kann nur ein Sitzplan als JSON geladen werden.', 'warn');
              }
              return;
            }
            try {
              await importPlanFromFile(jsonFile);
            } catch (err) {
              console.error(err);
              showMessage(err?.message || 'Sitzplan konnte nicht geladen werden.', 'error');
            }
          });


          els.exportPlan.addEventListener('click', () => downloadSeatPlan());
          els.importPlan.addEventListener('click', async () => {
            const picked = await pickPlanFileWithPicker();
            if (picked && picked.file) {
              try {
                await importPlanFromFile(picked.file, picked.handle);
                return;
              } catch (err) {
                console.error(err);
                showMessage(err?.message || 'Sitzplan konnte nicht geladen werden.', 'error');
                return;
              }
            }
            if (picked?.aborted) {
              return;
            }
            if (!picked || picked.supported === false) {
              els.importPlanFile?.click();
            }
          });
          els.printPlan?.addEventListener('click', () => printSeatPlan());
          els.importPlanFile.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
              await importPlanFromFile(file);
            } catch (err) {
              console.error(err);
              showMessage(err?.message || 'Sitzplan konnte nicht geladen werden.', 'error');
            } finally {
              e.target.value = '';
            }
          });

          els.patternPi?.addEventListener('click', activatePiPattern);
          els.patternE?.addEventListener('click', activateEPattern);
          els.patternBars3?.addEventListener('click', activateBars3Pattern);
          els.patternBars4?.addEventListener('click', activateBars4Pattern);
          els.patternBars3Gang?.addEventListener('click', activateBars3GangPattern);
          els.patternBars4Gang?.addEventListener('click', activateBars4GangPattern);

          function markPlanSavedAction() {
            state.lastActionWasPlanSave = true;
          }

          function markUnsavedAction() {
            state.lastActionWasPlanSave = false;
          }

          document.addEventListener('input', markUnsavedAction, true);
          document.addEventListener('change', markUnsavedAction, true);
          document.addEventListener('click', (e) => {
            const target = e.target;
            if (target instanceof Element && target.closest('#export-plan')) {
              return;
            }
            markUnsavedAction();
          }, true);

          let lastPreferencesFocus = null;
          let preferencesFocusRestorePending = false;

          function isPreferencesDialogOpen() {
            return Boolean(els.preferencesDialog && (els.preferencesDialog.open || els.preferencesDialog.hasAttribute('open')));
          }

          function resetPreferencesFocusTracking() {
            lastPreferencesFocus = null;
            preferencesFocusRestorePending = false;
          }

          function isInteractiveTarget(node) {
            if (!node || !(node instanceof Element)) return false;
            if (node.closest('button, input, select, textarea, option, a, label')) return true;
            const tabTarget = node.closest('[tabindex]');
            if (tabTarget) {
              const attr = tabTarget.getAttribute('tabindex');
              const tabIndex = attr === null ? tabTarget.tabIndex : Number(attr);
              if (Number.isFinite(tabIndex) && tabIndex >= 0) return true;
            }
            if (node.closest('[contenteditable=""], [contenteditable="true"]')) return true;
            return false;
          }

          function rememberPreferencesFocus(target) {
            if (!isPreferencesDialogOpen() || !els.preferencesDialog) return;
            if (!(target instanceof Element)) return;
            if (!els.preferencesDialog.contains(target)) return;
            lastPreferencesFocus = target;
            preferencesFocusRestorePending = false;
          }

          function markPreferencesFocusRestorePending() {
            if (!isPreferencesDialogOpen()) return;
            if (lastPreferencesFocus && lastPreferencesFocus.isConnected) {
              preferencesFocusRestorePending = true;
            }
          }

          function restorePreferencesFocusIfPending() {
            if (!preferencesFocusRestorePending) return;
            preferencesFocusRestorePending = false;
            if (!isPreferencesDialogOpen()) return;
            const target = lastPreferencesFocus;
            if (!target || !target.isConnected || !els.preferencesDialog?.contains(target)) return;
            if ('disabled' in target && target.disabled) return;
            const tryFocus = () => {
              if (!isPreferencesDialogOpen()) return;
              try { target.focus({ preventScroll: true }); }
              catch (_) {
                try { target.focus(); } catch (err) { }
              }
            };
            tryFocus();
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(tryFocus);
              requestAnimationFrame(() => requestAnimationFrame(tryFocus));
            }
            setTimeout(tryFocus, 25);
            setTimeout(tryFocus, 75);
            setTimeout(tryFocus, 150);
          }

          function handlePreferencesPointerDown(e) {
            if (!isPreferencesDialogOpen()) return;
            const target = e.target;
            if (isInteractiveTarget(target)) {
              preferencesFocusRestorePending = false;
              return;
            }
            markPreferencesFocusRestorePending();
            restorePreferencesFocusIfPending();
          }

          if (els.preferencesDialog) {
            els.preferencesDialog.addEventListener('focusin', e => rememberPreferencesFocus(e.target));
            window.addEventListener('blur', () => markPreferencesFocusRestorePending());
            window.addEventListener('focus', () => restorePreferencesFocusIfPending());
            window.addEventListener('pointerdown', handlePreferencesPointerDown, true);
            window.addEventListener('pointerup', () => restorePreferencesFocusIfPending(), true);
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState === 'hidden') {
                markPreferencesFocusRestorePending();
              } else if (document.visibilityState === 'visible') {
                restorePreferencesFocusIfPending();
              }
            });
          }
          els.seatPreferences?.addEventListener('click', () => {
            if (!state.students.length) {
              showMessage('Importiere zuerst die Namensliste!', 'warn');
              return;
            }
            buildSeatPreferencesTable();
            if (els.preferencesGuessHint) {
              els.preferencesGuessHint.textContent = '';
              els.preferencesGuessHint.title = '';
              els.preferencesGuessHint.style.fontSize = '';
            }
            if (els.preferencesDialog) {
              if (typeof els.preferencesDialog.showModal === 'function') {
                els.preferencesDialog.showModal();
              } else {
                els.preferencesDialog.setAttribute('open', 'open');
              }
              const focusDialog = () => { els.preferencesDialog?.focus({ preventScroll: true }); };
              if (typeof queueMicrotask === 'function') { queueMicrotask(focusDialog); }
              else { setTimeout(focusDialog, 0); }
            }
          });
          els.preferencesForm?.addEventListener('submit', e => {
            e.preventDefault();
            savePreferencesFromForm();
            if (els.preferencesDialog) {
              if (typeof els.preferencesDialog.close === 'function' && els.preferencesDialog.open) {
                els.preferencesDialog.close();
              }
              els.preferencesDialog.removeAttribute('open');
              resetPreferencesFocusTracking();
            }
          });
          els.preferencesCancel?.addEventListener('click', () => {
            if (els.preferencesDialog) {
              if (typeof els.preferencesDialog.close === 'function' && els.preferencesDialog.open) {
                els.preferencesDialog.close();
              }
              els.preferencesDialog.removeAttribute('open');
              resetPreferencesFocusTracking();
            }
          });
          els.preferencesGuessGender?.addEventListener('click', () => {
            applyGenderGuessInPreferences();
          });
          els.preferencesResetGender?.addEventListener('click', () => {
            resetGenderAssignmentsInPreferences();
          });
          els.preferencesDialog?.addEventListener('cancel', e => {
            e.preventDefault();
            if (typeof els.preferencesDialog?.close === 'function' && els.preferencesDialog.open) {
              els.preferencesDialog.close();
            }
            els.preferencesDialog?.removeAttribute('open');
            resetPreferencesFocusTracking();
          });
          els.criteriaDialogClose?.addEventListener('click', () => {
            closeCriteriaDialog();
          });
          els.criteriaDialog?.addEventListener('cancel', e => {
            e.preventDefault();
            closeCriteriaDialog();
          });

          els.toggleSeatScores?.addEventListener('click', () => {
            state.seatScoresHidden = !state.seatScoresHidden;
            applySeatScoreVisibility();
            syncSeatScoreToggleButton();
          });
          els.summaryDialogClose?.addEventListener('click', () => {
            closeSummaryDialog();
          });
          els.summaryDialog?.addEventListener('cancel', e => {
            e.preventDefault();
            closeSummaryDialog();
          });
          els.preferencesTableBody?.addEventListener('change', e => {
            const target = e.target;
            if (!target || (target.tagName !== 'SELECT' && target.type !== 'checkbox')) return;

            const sid = target.dataset.studentId;
            if (!sid) return;

            if (target.dataset.preference === 'alone') {
              syncBuddyPreferenceAvailability(sid);
              return;
            }

            if (target.dataset.genderChoice) {
              if (target.checked) {
                const siblings = els.preferencesTableBody.querySelectorAll(`input[data-student-id="${sid}"][data-gender-choice]`);
                siblings.forEach(cb => {
                  if (cb !== target) cb.checked = false;
                });
              }
              return;
            }

            if (!target.dataset.prefType) return;

            updatePreferenceOptionDisablingForStudent(sid);
          });

          const twoerToggleInputs = Array.from(document.querySelectorAll('input[name="twoer-toggle"]'));
          if (twoerToggleInputs.length) {
            const applyInitialMergeMode = () => {
              const checked = twoerToggleInputs.find(input => input.checked);
              setMergeModeFromToggle(checked?.value || 'zulässig');
            };
            twoerToggleInputs.forEach(input => {
              input.addEventListener('change', () => {
                if (input.checked) {
                  setMergeModeFromToggle(input.value);
                }
              });
            });
            applyInitialMergeMode();
          } else {
            applyMergeIconVisibility();
          }


          els.random.addEventListener('click', () => {
            if (!state.students.length) { showMessage('Importiere zuerst die Namensliste!', 'warn'); return; }
            const activeIds = Array.from(state.activeSeats);
            if (!activeIds.length) { showMessage('Bitte zuerst Platzraster einrichten.', 'warn'); return; }
            const teacherSeat = Object.entries(state.seats).find(([, sid]) => sid === 'TEACHER');
            const teacherSeatId = teacherSeat ? teacherSeat[0] : null;
            const targetSeats = activeIds.filter(id => id !== teacherSeatId);
            if (!targetSeats.length) { showMessage('Keine freien aktiven Plätze verfügbar.', 'warn'); return; }
            const shuffled = state.students.slice();
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            const newSeats = {};
            activeIds.forEach(id => { newSeats[id] = null; });
            if (teacherSeatId) { newSeats[teacherSeatId] = 'TEACHER'; }
            const blockedIds = new Set(Object.values(newSeats).filter(Boolean));
            const pool = shuffled.filter(s => !blockedIds.has(s.id));
            targetSeats.forEach((id, idx) => { const student = pool[idx]; newSeats[id] = student ? student.id : null; });
            state.seats = newSeats;
            renderSeats();
            refreshUnseated();
          });

          els.suggest.addEventListener('click', () => {
            if (!state.students.length) { showMessage('Importiere zuerst die Namensliste!', 'warn'); return; }
            const seatSorter = (a, b) => { const [ar, ac] = a.split('-').map(Number); const [br, bc] = b.split('-').map(Number); return ar === br ? ac - bc : ar - br; };
            const activeIds = Array.from(state.activeSeats).sort(seatSorter);
            if (!activeIds.length) { showMessage('Bitte zuerst Plätze aktivieren.', 'warn'); return; }
            const hadAssignments = Object.values(state.seats).some(sid => sid && sid !== 'TEACHER');
            if (hadAssignments) {
              showMessage('Beachte, dass das Vorschlagstool nur die Lernenden betrachtet, die noch keinem Sitzplatz im Raster zugewiesen wurden (nutze ggf. "Belegung zurücksetzen").', 'info');
            }
            const teacherSeatId = Object.entries(state.seats).find(([, sid]) => sid === 'TEACHER')?.[0] || null;
            const teacherDistanceConds = Array.from(getTeacherDistanceMap().entries())
              .map(([studentId, maxDistance]) => ({ studentId, maxDistance }));
            if (teacherDistanceConds.length && !teacherSeatId) {
              showMessage('Wenn „weit vorne“ aktiviert ist, muss der Lehrkraft (= vorne) ein Platz zugewiesen sein.', 'warn');
              return;
            }
            const studentCount = state.students.length;
            const smallClass = studentCount <= 22;
            const activeSet = new Set(activeIds);
            const totalBudgetMs = smallClass ? 6500 : 4000;
            const runStarted = nowMs();
            startTimedSuggestProgress(totalBudgetMs, 'Vorschlag wird berechnet...', runStarted);
            const runSuggestion = () => {
              const deadlineTs = runStarted + totalBudgetMs;
              const timeLeftMs = () => Math.max(0, deadlineTs - nowMs());
              const outOfTime = () => timeLeftMs() <= 0;

              try {
                const fixedSeats = new Set(
                  Object.entries(state.seats)
                    .filter(([id, sid]) => sid && sid !== 'TEACHER')
                    .map(([id]) => id)
                );
                const fixedStudentIds = new Set([...fixedSeats].map(id => state.seats[id]).filter(Boolean));

                let targetSeatsArr = activeIds.filter(id => id !== teacherSeatId && !fixedSeats.has(id));
                let availableSet = new Set(targetSeatsArr);
                if (!availableSet.size) {
                  if (fixedSeats.size) {
                    const freed = activeIds.filter(id => id !== teacherSeatId);
                    availableSet = new Set(freed);
                    fixedSeats.clear();
                  } else { showMessage('Keine freien aktiven Plätze verfügbar.', 'warn'); return; }
                }

                const studentById = new Map(state.students.map(s => [s.id, s]));
                const mergedPairs = state.mergedPairs || new Set();
                const teacherDistanceMap = getTeacherDistanceMap();
                const teacherDistanceWanted = new Set(Array.from(teacherDistanceMap.keys()));
                const genderAlternate = !!state.conditions?.genderAlternation;
                const conflictCache = createConflictCache(activeSet, studentById, mergedPairs, {
                  activeIds,
                  genderAlternate,
                  teacherDistanceMap,
                  teacherDistanceWanted,
                });

                const seatCoords = conflictCache.seatCoords;
                const neighborMap = new Map();
                activeIds.forEach(seatKey => {
                  const coords = seatCoords.get(seatKey);
                  if (!coords) return;
                  const { r, c } = coords;
                  const cand = [seatId(r - 1, c), seatId(r + 1, c), seatId(r, c - 1), seatId(r, c + 1)];
                  neighborMap.set(seatKey, cand.filter(n => activeSet.has(n)));
                });

                const seatNeighbors = (sid) => neighborMap.get(sid) || [];
                const neighborsOf = (sid) => seatNeighbors(sid).filter(n => availableSet.has(n));

                const occupied = new Map();
                for (const id of fixedSeats) { occupied.set(id, state.seats[id]); }
                if (teacherSeatId) { occupied.set(teacherSeatId, 'TEACHER'); }

                const seatByStudent = new Map();
                for (const id of fixedSeats) {
                  const sid = state.seats[id];
                  if (sid) seatByStudent.set(sid, id);
                }
                const teacherRow = teacherSeatId ? parseInt(teacherSeatId.split('-')[0], 10) : null;
                const activeRows = getActiveRows(activeSet);
                const teacherCoords = teacherSeatId ? seatCoords.get(teacherSeatId) : null;
                const teacherRowIdx = (teacherCoords && conflictCache.rowIndex.has(teacherCoords.r))
                  ? conflictCache.rowIndex.get(teacherCoords.r)
                  : null;

                const teacherPenalty = (studentId, seatKey) => {
                  if (teacherRowIdx === null) return 0;
                  if (!teacherDistanceWanted.has(studentId)) return 0;
                  const seatRowIdx = conflictCache.seatRowIndex.get(seatKey);
                  if (seatRowIdx === undefined) return 0;
                  const dist = Math.abs(seatRowIdx - teacherRowIdx);
                  if (dist >= 3) return 3;
                  if (dist === 2) return 1;
                  return 0;
                };

                const adjacencyCost = (aId, bId, seatA, seatB) => {
                  if (!aId || !bId || aId === 'TEACHER' || bId === 'TEACHER') return 0;
                  if (!studentById.has(aId) || !studentById.has(bId)) return 0;
                  const mergedKey = pairKey(seatA, seatB);
                  const mergeFactor = mergedKey && mergedPairs instanceof Set && mergedPairs.has(mergedKey) ? 2 : 1;
                  let cost = 0;
                  const alonePenalty = ALONE_NEIGHBOR_PENALTY * mergeFactor;
                  if (studentById.get(aId)?.prefersAlone) cost += alonePenalty;
                  if (studentById.get(bId)?.prefersAlone) cost += alonePenalty;
                  if (genderAlternate) {
                    const gA = conflictCache.genderById.get(aId);
                    const gB = conflictCache.genderById.get(bId);
                    if (gA && gB && gA === gB) cost += 0.5;
                  }
                  const foesA = conflictCache.foeSetById.get(aId);
                  const foesB = conflictCache.foeSetById.get(bId);
                  const aFoeB = (foesA instanceof Set && foesA.has(bId));
                  const bFoeA = (foesB instanceof Set && foesB.has(aId));
                  if (aFoeB) cost += 4 * mergeFactor;
                  if (bFoeA) cost += 4 * mergeFactor;
                  if (aFoeB || bFoeA) return cost;
                  const aLikes = conflictCache.buddySetById.get(aId)?.has(bId) || false;
                  const bLikes = conflictCache.buddySetById.get(bId)?.has(aId) || false;
                  if (aLikes) cost -= mergeFactor * BUDDY_ADJACENT_BONUS_ONE_WAY;
                  if (bLikes) cost -= mergeFactor * BUDDY_ADJACENT_BONUS_ONE_WAY;
                  return cost;
                };

                const buddyDistanceBonus = (studentId, seatKey, ignoreStudentId = null) => {
                  const buddies = conflictCache.buddySetById.get(studentId);
                  const hasBuddies = buddies instanceof Set && buddies.size;
                  if (!hasBuddies) return 0;
                  const a = seatCoords.get(seatKey);
                  if (!a) return 0;
                  const foesA = conflictCache.foeSetById.get(studentId);
                  let bonus = 0;
                  buddies.forEach(buddyId => {
                    if (!buddyId || buddyId === ignoreStudentId) return;
                    const buddySeat = seatByStudent.get(buddyId);
                    if (!buddySeat) return;
                    const b = seatCoords.get(buddySeat);
                    if (!b) return;
                    const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                    if (dist < 2 || dist > 3) return;
                    const foesB = conflictCache.foeSetById.get(buddyId);
                    const blocked = (foesA instanceof Set && foesA.has(buddyId))
                      || (foesB instanceof Set && foesB.has(studentId));
                    if (blocked) return;
                    const factor = foeDistanceEffectFactor(a, b, conflictCache.activeHas);
                    bonus += scaledBuddyDistance23(BUDDY_DISTANCE_BASE_BONUS_ONE_WAY, dist) * factor;
                  });
                  return bonus;
                };

                const foeDistanceCost = (studentId, seatKey, ignoreStudentId = null) => {
                  const outgoing = conflictCache.foeSetById.get(studentId);
                  const incoming = conflictCache.incomingFoesById?.get(studentId);
                  const hasOutgoing = outgoing instanceof Set && outgoing.size;
                  const hasIncoming = incoming instanceof Set && incoming.size;
                  if (!hasOutgoing && !hasIncoming) return 0;
                  const a = seatCoords.get(seatKey);
                  if (!a) return 0;
                  let cost = 0;
                  const addPenaltyFor = (foeId) => {
                    if (!foeId || foeId === ignoreStudentId) return;
                    const foeSeat = seatByStudent.get(foeId);
                    if (!foeSeat) return;
                    const b = seatCoords.get(foeSeat);
                    if (!b) return;
                    const dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
                    const factor = foeDistanceEffectFactor(a, b, conflictCache.activeHas);
                    if (dist === 2) cost += 1 * factor;
                    else cost += scaledDistance34(0.2, dist) * factor;
                  };
                  if (hasOutgoing) {
                    outgoing.forEach(addPenaltyFor);
                  }
                  if (hasIncoming) {
                    incoming.forEach(addPenaltyFor);
                  }
                  return cost;
                };

                const placementScore = (studentId, seatKey) => {
                  let cost = teacherPenalty(studentId, seatKey);
                  const neighbors = seatNeighbors(seatKey);
                  for (const nb of neighbors) {
                    const occ = occupied.get(nb);
                    if (!occ || occ === 'TEACHER') continue;
                    cost += adjacencyCost(studentId, occ, seatKey, nb);
                  }
                  cost -= buddyDistanceBonus(studentId, seatKey);
                  cost += foeDistanceCost(studentId, seatKey);
                  return cost;
                };

                const violatesFoe = (studentId, seatId, extraOccupants = {}, occMap = null) => {
                  const neighbors = seatNeighbors(seatId);
                  const student = studentById.get(studentId);
                  if (!student) return false;
                  const sourceMap = occMap ?? occupied;
                  for (const nb of neighbors) {
                    const occ = Object.prototype.hasOwnProperty.call(extraOccupants, nb)
                      ? extraOccupants[nb]
                      : sourceMap instanceof Map
                        ? sourceMap.get(nb)
                        : sourceMap && typeof sourceMap === 'object'
                          ? sourceMap[nb]
                          : undefined;
                    if (!occ || occ === 'TEACHER') continue;
                    if (hasFoePreference(student, occ)) return true;
                  }
                  return false;
                };
                const violatesPlacement = (studentId, seatId, extraOccupants = {}, occMap = null) => {
                  return violatesFoe(studentId, seatId, extraOccupants, occMap);
                };

                const wants = new Map(state.students.map(s => [s.id, new Set(getBuddyList(s))]));
                const seenPairs = new Set(); const mutualPairs = []; const oneWayPairs = [];
                state.students.forEach(s => {
                  getBuddyList(s).forEach(bid => {
                    if (!studentById.has(bid) || bid === s.id) return;
                    const sFoes = studentById.get(s.id)?.foes || []; const oFoes = studentById.get(bid)?.foes || [];
                    if (sFoes.includes(bid) || oFoes.includes(s.id)) return;
                    const key = [s.id, bid].sort().join('|'); if (seenPairs.has(key)) return; seenPairs.add(key);
                    if (wants.get(bid)?.has(s.id)) mutualPairs.push([s.id, bid]);
                    else oneWayPairs.push([s.id, bid]);
                  });
                });
                const pairPriority = (pair) => {
                  if (!pair || pair.length !== 2) return 0;
                  const [a, b] = pair;
                  const sa = studentById.get(a) || {};
                  const sb = studentById.get(b) || {};
                  const degA = ((sa.foes?.length || 0) * 2) + buddyCount(sa) + (teacherDistanceWanted.has(a) ? 2 : 0);
                  const degB = ((sb.foes?.length || 0) * 2) + buddyCount(sb) + (teacherDistanceWanted.has(b) ? 2 : 0);
                  return degA + degB;
                };
                mutualPairs.sort((a, b) => pairPriority(b) - pairPriority(a));
                oneWayPairs.sort((a, b) => pairPriority(b) - pairPriority(a));
                const pairs = [...mutualPairs, ...oneWayPairs];

                const combinations = (arr, k) => { const result = []; const pick = (start, buf) => { if (buf.length === k) { result.push(buf.slice()); return; } for (let i = start; i <= arr.length - (k - buf.length); i++) { buf.push(arr[i]); pick(i + 1, buf); buf.pop(); } }; if (k > 0) pick(0, []); return result; };
                const assignments = {};
                const assignedStudents = new Set(fixedStudentIds);

                const tryAssignMultiBuddy = (center) => {
                  if (outOfTime()) return;
                  if (assignedStudents.has(center.id) || fixedStudentIds.has(center.id)) return;
                  const buddyCandidates = getBuddyList(center).filter(bid => studentById.has(bid)).filter(bid => !assignedStudents.has(bid) && !fixedStudentIds.has(bid));
                  if (buddyCandidates.length < 2) return;
                  const centerSeats = Array.from(availableSet).sort((a, b) => {
                    const da = placementScore(center.id, a);
                    const db = placementScore(center.id, b);
                    if (da !== db) return da - db;
                    return seatSorter(a, b);
                  });
                  for (const sId of centerSeats) {
                    if (outOfTime()) return;
                    if (!availableSet.has(sId)) continue;
                    if (violatesPlacement(center.id, sId)) continue;
                    const neighborSeats = neighborsOf(sId).sort(seatSorter);
                    if (neighborSeats.length < 2) continue;
                    const maxAssignable = Math.min(neighborSeats.length, buddyCandidates.length);
                    for (let take = maxAssignable; take >= 2; take--) {
                      if (outOfTime()) return;
                      const seatCombos = combinations(neighborSeats, take);
                      for (const seatCombo of seatCombos) {
                        if (outOfTime()) return;
                        const usedBuddies = new Set(); const assignOrder = [];
                        const attempt = (idx) => {
                          if (outOfTime()) return false;
                          if (idx === seatCombo.length) {
                            const extrasForCenter = {}; seatCombo.forEach((sid, index) => { extrasForCenter[sid] = assignOrder[index]; });
                            if (violatesPlacement(center.id, sId, extrasForCenter)) return false;
                            for (let i = 0; i < seatCombo.length; i++) {
                              const buddyId = assignOrder[i]; const buddySeat = seatCombo[i];
                              const extras = { [sId]: center.id }; for (let j = 0; j < seatCombo.length; j++) { if (i === j) continue; extras[seatCombo[j]] = assignOrder[j]; }
                              if (violatesPlacement(buddyId, buddySeat, extras)) return false;
                            }
                            assignments[sId] = center.id; availableSet.delete(sId); assignedStudents.add(center.id); occupied.set(sId, center.id); seatByStudent.set(center.id, sId);
                            seatCombo.forEach((sid, index) => {
                              const buddyId = assignOrder[index];
                              assignments[sid] = buddyId;
                              availableSet.delete(sid);
                              assignedStudents.add(buddyId);
                              occupied.set(sid, buddyId);
                              seatByStudent.set(buddyId, sid);
                            });
                            return true;
                          }
                          const currentSeat = seatCombo[idx];
                          for (const buddyId of buddyCandidates) {
                            if (usedBuddies.has(buddyId)) continue;
                            const extras = { [sId]: center.id }; for (let j = 0; j < assignOrder.length; j++) { extras[seatCombo[j]] = assignOrder[j]; }
                            if (violatesPlacement(buddyId, currentSeat, extras)) continue;
                            usedBuddies.add(buddyId); assignOrder.push(buddyId);
                            if (attempt(idx + 1)) return true;
                            assignOrder.pop(); usedBuddies.delete(buddyId);
                          }
                          return false;
                        };
                        if (attempt(0)) return;
                      }
                    }
                  }
                };
                const multiBuddyStudents = state.students
                  .filter(s => buddyCount(s) > 1)
                  .sort((a, b) => buddyCount(b) - buddyCount(a));
                for (const student of multiBuddyStudents) {
                  if (outOfTime()) break;
                  tryAssignMultiBuddy(student);
                }

                const pairPlacementScore = (aId, seatA, bId, seatB) => {
                  let cost = 0;
                  cost += teacherPenalty(aId, seatA);
                  cost += teacherPenalty(bId, seatB);
                  cost += adjacencyCost(aId, bId, seatA, seatB);

                  const nA = seatNeighbors(seatA);
                  for (const nb of nA) {
                    if (nb === seatB) continue;
                    const occ = occupied.get(nb);
                    if (!occ || occ === 'TEACHER') continue;
                    cost += adjacencyCost(aId, occ, seatA, nb);
                  }
                  const nB = seatNeighbors(seatB);
                  for (const nb of nB) {
                    if (nb === seatA) continue;
                    const occ = occupied.get(nb);
                    if (!occ || occ === 'TEACHER') continue;
                    cost += adjacencyCost(bId, occ, seatB, nb);
                  }

                  cost += foeDistanceCost(aId, seatA, bId);
                  cost += foeDistanceCost(bId, seatB, aId);
                  cost -= buddyDistanceBonus(aId, seatA, bId);
                  cost -= buddyDistanceBonus(bId, seatB, aId);
                  return cost;
                };

                const seatPairCandidates = () => {
                  const seats = Array.from(availableSet).sort(seatSorter);
                  const out = [];
                  for (const sId of seats) {
                    const nbs = neighborsOf(sId);
                    for (const nb of nbs) {
                      if (!availableSet.has(nb)) continue;
                      if (seatSorter(sId, nb) >= 0) continue;
                      out.push([sId, nb]);
                    }
                  }
                  return out;
                };

                for (const [a, b] of pairs) {
                  if (outOfTime()) break;
                  if (assignedStudents.has(a) || assignedStudents.has(b)) continue;

                  let best = null;
                  let bestScore = Infinity;
                  const candidates = seatPairCandidates();
                  for (let idx = 0; idx < candidates.length; idx++) {
                    if (idx % 30 === 0 && outOfTime()) break;
                    const [s1, s2] = candidates[idx];

                    if (!violatesPlacement(a, s1, { [s2]: b }) && !violatesPlacement(b, s2, { [s1]: a })) {
                      const score = pairPlacementScore(a, s1, b, s2);
                      if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && Math.random() < 0.5)) {
                        bestScore = score;
                        best = { seatA: s1, seatB: s2 };
                      }
                    }
                    if (!violatesPlacement(a, s2, { [s1]: b }) && !violatesPlacement(b, s1, { [s2]: a })) {
                      const score = pairPlacementScore(a, s2, b, s1);
                      if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && Math.random() < 0.5)) {
                        bestScore = score;
                        best = { seatA: s2, seatB: s1 };
                      }
                    }
                  }

                  if (best) {
                    assignments[best.seatA] = a;
                    assignments[best.seatB] = b;
                    availableSet.delete(best.seatA);
                    availableSet.delete(best.seatB);
                    assignedStudents.add(a);
                    assignedStudents.add(b);
                    occupied.set(best.seatA, a);
                    occupied.set(best.seatB, b);
                    seatByStudent.set(a, best.seatA);
                    seatByStudent.set(b, best.seatB);
                  }
                }

                const remainingStudents = state.students
                  .filter(s => !assignedStudents.has(s.id))
                  .slice()
                  .sort((a, b) => {
                    const degA = ((a.foes?.length || 0) * 2) + buddyCount(a) + (teacherDistanceWanted.has(a.id) ? 2 : 0);
                    const degB = ((b.foes?.length || 0) * 2) + buddyCount(b) + (teacherDistanceWanted.has(b.id) ? 2 : 0);
                    if (degA !== degB) return degB - degA;
                    return String(a.id || '').localeCompare(String(b.id || ''));
                  });
                const unplaced = [];
                for (const student of remainingStudents) {
                  if (!availableSet.size) { unplaced.push(student); continue; }
                  let bestSeat = null;
                  let bestScore = Infinity;
                  for (const seatKey of availableSet) {
                    if (violatesFoe(student.id, seatKey)) continue;
                    const score = placementScore(student.id, seatKey);
                    if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && Math.random() < 0.5)) {
                      bestScore = score;
                      bestSeat = seatKey;
                    }
                  }
                  if (!bestSeat) {
                    for (const seatKey of availableSet) {
                      const score = placementScore(student.id, seatKey);
                      if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && Math.random() < 0.5)) {
                        bestScore = score;
                        bestSeat = seatKey;
                      }
                    }
                  }
                  if (!bestSeat) { unplaced.push(student); continue; }
                  assignments[bestSeat] = student.id;
                  availableSet.delete(bestSeat);
                  assignedStudents.add(student.id);
                  occupied.set(bestSeat, student.id);
                  seatByStudent.set(student.id, bestSeat);
                }

                let finalSeatMap = new Map();
                activeIds.forEach(id => { finalSeatMap.set(id, null); });
                if (teacherSeatId) finalSeatMap.set(teacherSeatId, 'TEACHER');
                for (const id of fixedSeats) { if (finalSeatMap.has(id)) finalSeatMap.set(id, state.seats[id]); }
                Object.entries(assignments).forEach(([sid, pid]) => { if (finalSeatMap.has(sid)) finalSeatMap.set(sid, pid || null); });

                if (unplaced.length) {
                  for (const stu of unplaced) {
                    if (outOfTime()) break;
                    const emptySeat = activeIds.find(sid =>
                      sid !== teacherSeatId
                      && !finalSeatMap.get(sid)
                      && !violatesPlacement(stu.id, sid)
                    );
                    if (emptySeat) { finalSeatMap.set(emptySeat, stu.id); }
                  }
                }

                const lockedSeatIds = new Set(fixedSeats);
                if (teacherSeatId) lockedSeatIds.add(teacherSeatId);
                const studentMap = new Map(state.students.map(s => [s.id, s]));
                const mutableSeatIds = activeIds.filter(id => !lockedSeatIds.has(id));
                const mutableSeatsCount = mutableSeatIds.length;
                let annealResult = null;
                let exactResult = null;

                let bestMap = finalSeatMap;
                let bestCost = countConflicts(finalSeatMap, activeSet, studentMap, mergedPairs);

                if (smallClass && mutableSeatsCount >= 4 && !outOfTime()) {
                  const seedBase = (Date.now() ^ (mutableSeatsCount * 2654435761)) >>> 0;
                  const maxRandomStarts = Math.min(10, Math.max(4, Math.floor(timeLeftMs() / 200)));
                  const baseMap = finalSeatMap;
                  for (let r = 0; r < maxRandomStarts; r++) {
                    if (outOfTime()) break;
                    const rng = createSeededRandom(seedBase + r * 101);
                    const candidate = randomizeSeatMap(baseMap, mutableSeatIds, rng);
                    const cost = countConflicts(candidate, activeSet, studentMap, mergedPairs);
                    if (cost < bestCost - 1e-9) {
                      bestCost = cost;
                      bestMap = candidate;
                    }
                  }
                }

                const tryExact = smallClass
                  ? (mutableSeatsCount <= 16 && studentCount <= 20)
                  : (mutableSeatsCount <= 12 && studentCount <= 18);
                if (tryExact) {
                  if (outOfTime()) {
                    exactResult = null;
                  } else {
                    const exactBudgetCap = smallClass ? 2000 : 2500;
                    const exactBudgetMs = Math.min(exactBudgetCap, Math.floor(timeLeftMs()));
                    if (exactBudgetMs >= 120) {
                      exactResult = exactOptimizeSeatMap(
                        bestMap,
                        activeIds,
                        studentMap,
                        lockedSeatIds,
                        {
                          timeLimitMs: exactBudgetMs,
                        }
                      );
                      if (exactResult?.map instanceof Map) {
                        bestMap = exactResult.map;
                        bestCost = Number.isFinite(exactResult.bestCost)
                          ? exactResult.bestCost
                          : countConflicts(bestMap, activeSet, studentMap, mergedPairs);
                      }
                    }
                  }
                }

                const minRunBudget = smallClass ? 250 : 350;
                const maxRuns = smallClass ? 12 : 8;
                const remainingForAnneal = Math.floor(timeLeftMs());
                const polishReserveMs = remainingForAnneal >= (minRunBudget + (smallClass ? 450 : 300))
                  ? (smallClass ? 320 : 220)
                  : 0;
                const annealDeadlineTs = deadlineTs - polishReserveMs;
                const timeLeftForAnneal = () => Math.max(0, annealDeadlineTs - nowMs());
                const annealBudgetMs = Math.floor(timeLeftForAnneal());
                const runs = annealBudgetMs >= minRunBudget
                  ? Math.min(maxRuns, Math.max(1, Math.floor(annealBudgetMs / minRunBudget)))
                  : 0;
                let anyAnnealLimit = false;

                if (!runs || outOfTime()) {
                  annealResult = { map: bestMap, bestCost, timeLimitHit: false };
                } else {
                  const baseShuffle = Math.max(8, Math.floor(mutableSeatIds.length * (smallClass ? 6 : 5)));
                  for (let r = 0; r < runs; r++) {
                    if (outOfTime()) break;
                    const budgetLeft = Math.floor(timeLeftForAnneal());
                    const runsRemaining = runs - r;
                    if (budgetLeft < 120 || runsRemaining <= 0) break;
                    const perRunBudget = Math.max(120, Math.floor(budgetLeft / runsRemaining));
                    const seed = (Date.now() + r * 101) >>> 0;
                    const rng = createSeededRandom(seed);
                    const startMap = (r === 0)
                      ? bestMap
                      : perturbSeatMap(bestMap, mutableSeatIds, rng, baseShuffle * (1 + r));
                    const res = optimizeSeatMapWithAnnealing(
                      startMap,
                      activeIds,
                      studentMap,
                      lockedSeatIds,
                      {
                        timeLimitMs: perRunBudget,
                        randomFn: rng
                      }
                    );
                    const resCost = res?.bestCost ?? countConflicts(res?.map || bestMap, activeSet, studentMap, mergedPairs);
                    const resMap = res?.map instanceof Map ? res.map : bestMap;
                    if (resCost < bestCost) {
                      bestCost = resCost;
                      bestMap = resMap;
                    }
                    if (res?.timeLimitHit) {
                      anyAnnealLimit = true;
                    }
                  }
                  annealResult = { map: bestMap, bestCost, timeLimitHit: anyAnnealLimit };
                }
                finalSeatMap = bestMap;

                const polishBudgetMs = Math.floor(timeLeftMs());
                if (polishBudgetMs >= 120 && !outOfTime()) {
                  const polish = improveSeatMapWithBestSwaps(finalSeatMap, activeIds, studentMap, lockedSeatIds, { maxPasses: 20, timeLimitMs: polishBudgetMs });
                  if (polish?.map instanceof Map && Number.isFinite(polish.bestCost) && polish.bestCost < (bestCost - 1e-9)) {
                    finalSeatMap = polish.map;
                    bestMap = polish.map;
                    bestCost = polish.bestCost;
                    if (annealResult) {
                      annealResult.map = bestMap;
                      annealResult.bestCost = bestCost;
                    }
                  }
                }

                const repairBudgetMs = Math.floor(timeLeftMs());
                if (repairBudgetMs >= 120 && !outOfTime()) {
                  const repair = improveSeatMapWithWorstStudents(
                    finalSeatMap,
                    activeIds,
                    studentMap,
                    lockedSeatIds,
                    {
                      maxRounds: smallClass ? 6 : 3,
                      maxStudents: smallClass ? 6 : 4,
                      timeLimitMs: repairBudgetMs,
                    }
                  );
                  if (repair?.map instanceof Map && Number.isFinite(repair.bestCost) && repair.bestCost < (bestCost - 1e-9)) {
                    finalSeatMap = repair.map;
                    bestMap = repair.map;
                    bestCost = repair.bestCost;
                    if (annealResult) {
                      annealResult.map = bestMap;
                      annealResult.bestCost = bestCost;
                    }
                  }
                }

                let teacherDistanceSatisfied = true;
                if (teacherDistanceConds.length && teacherSeatId) {
                  teacherDistanceSatisfied = teacherDistanceConds.every(cond => {
                    const seatEntry = [...finalSeatMap.entries()].find(([, sid]) => sid === cond.studentId);
                    if (!seatEntry) return false;
                    const seatRow = parseInt(seatEntry[0].split('-')[0], 10);
                    const dist = activeRowDistance(activeRows, teacherRow, seatRow);
                    return dist !== null && dist <= cond.maxDistance;
                  });
                }

                const newSeats = {};
                finalSeatMap.forEach((val, id) => { newSeats[id] = val || null; });
                state.seats = newSeats;
                renderSeats({ skipOptimalMark: true });
                refreshUnseated();
                if (Number.isFinite(bestCost)) {
                  state.optimalScore = Number.isFinite(bestCost) ? -bestCost : null;
                  state.optimalScoreStale = false;
                  updateSidebarScore();
                }

                if (unplaced.length) {
                  const confAfter = countConflicts(new Map(Object.entries(state.seats)), activeSet, new Map(state.students.map(s => [s.id, s])), mergedPairs);
                  if (confAfter > 0) {
                    console.warn(`${unplaced.length} Lernende mussten vorläufig gesetzt werden; ${confAfter} Konflikte verbleiben.`);
                    showMessage(`${unplaced.length} Lernende mussten vorläufig gesetzt werden. Es bestehen noch ${confAfter} Konflikte.`, 'warn', { duration: 7000 });
                  }
                }
                if (teacherDistanceConds.length && !teacherDistanceSatisfied) {
                  showMessage('Die Bedingung zum maximalen Abstand zur Lehrkraft konnte nicht vollständig erfüllt werden.', 'warn', { duration: 7000 });
                }
              } finally {
                fadeOutSuggestProgress();
              }
            };
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(() => requestAnimationFrame(runSuggestion));
            } else {
              setTimeout(runSuggestion, 0);
            }
          });

          if (els.flipPerspective) {
            applyPerspectiveView();
            els.flipPerspective.addEventListener('click', () => {
              state.perspectiveFlipped = !state.perspectiveFlipped;
              applyPerspectiveView();
            });
          }

          if (els.adjustGrid) {
            els.adjustGrid.addEventListener('click', () => showGridDialog());
          }

          if (els.gridDialogForm) {
            els.gridDialogForm.addEventListener('submit', e => {
              e.preventDefault();
              const rows = parseInt(els.gridDialogRows?.value ?? '', 10);
              const cols = parseInt(els.gridDialogCols?.value ?? '', 10);
              if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
                showMessage('Bitte gib gültige Werte (≥ 1) für Zeilen und Spalten ein.', 'warn');
                return;
              }
              applyGridDimensions(rows, cols);
              closeGridDialog();
            });
          }

          if (els.gridDialogCancel) {
            els.gridDialogCancel.addEventListener('click', () => closeGridDialog());
          }

          if (els.gridDialogMinimum) {
            els.gridDialogMinimum.addEventListener('click', () => {
              minimizeGridToActiveBounds();
              closeGridDialog();
            });
          }

          if (els.gridDialog) {
            els.gridDialog.addEventListener('cancel', e => {
              e.preventDefault();
              closeGridDialog();
            });
          }

          els.resetLearners.addEventListener('click', () => {
            const teacherSeat = Object.entries(state.seats).find(([, sid]) => sid === 'TEACHER');
            const teacherSeatId = teacherSeat ? teacherSeat[0] : null;
            const nextSeats = {};
            Object.keys(state.seats).forEach(id => {
              nextSeats[id] = (teacherSeatId && id === teacherSeatId) ? 'TEACHER' : null;
            });
            state.seats = nextSeats;
            if (teacherSeatId) removeMergesInvolving([teacherSeatId]);
            renderSeats();
            refreshUnseated();
          });

          els.resetRaster.addEventListener('click', () => {
            state.activeSeats = new Set();
            state.seats = {};
            state.mergedPairs = new Set();
            buildGrid();
            refreshUnseated();
          });

          const handleViewportChange = () => {
            updateGridViewportMode();
          };
          window.addEventListener('resize', handleViewportChange);
          if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleViewportChange);
          }
          if (typeof ResizeObserver === 'function' && els.gridWrap) {
            const observer = new ResizeObserver(handleViewportChange);
            observer.observe(els.gridWrap);
          }

          buildGrid();
          refreshUnseated();
        })();
