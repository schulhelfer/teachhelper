const WINDOWS_SCRIPT_NAME = "TeachHelper-Drucken.js";
const MACOS_SCRIPT_NAME = "TeachHelper-Drucken.applescript";
const MANIFEST_NAME = "TeachHelper-Dateiliste.txt";

export function detectExpectationHorizonPrintPlatform(navigatorRef = globalThis.navigator) {
  const agent = String(navigatorRef?.userAgent || "");
  const platform = String(navigatorRef?.userAgentData?.platform || navigatorRef?.platform || "");
  if (/Android|iPhone|iPad|iPod/i.test(agent) || (/Mac/i.test(platform) && navigatorRef?.maxTouchPoints > 1)) {
    return null;
  }
  if (/Windows|Win32|Win64/i.test(`${platform} ${agent}`)) return "windows";
  if (/macOS|Macintosh|MacIntel|MacPPC/i.test(`${platform} ${agent}`)) return "macos";
  return null;
}

function quoteShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  ));
}

function quoteAppleScript(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function buildWindowsLauncher(batchId, folderName) {
  const folderCharacterCodes = Array.from({ length: folderName.length }, (_, index) => folderName.charCodeAt(index)).join(",");
  return String.raw`var fso=new ActiveXObject('Scripting.FileSystemObject'),shell=new ActiveXObject('WScript.Shell'),q=String.fromCharCode(34),zip='',folder='',previous=shell.CurrentDirectory;
try{
var downloads=shell.ExpandEnvironmentStrings(shell.RegRead('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\\{374DE290-123F-4565-9164-39C4925E467B}'));
var matches=[],items=new Enumerator(fso.GetFolder(downloads).Files),pattern=/-TH-EWH-${batchId}(?: \([0-9]+\))?\.zip$/i;
for(;items.atEnd()===false;items.moveNext()){var item=items.item();if(pattern.test(item.Name)){matches.push(item.Path);}}
if(matches.length===0){throw new Error('ZIP nicht gefunden. Download abwarten und ZIP im Download-Ordner speichern.');}
if(matches.length>1){throw new Error('Mehrere ZIP-Dateien dieses Exports gefunden. Nur eine davon im Download-Ordner behalten.');}
zip=matches[0];var base=String.fromCharCode(${folderCharacterCodes}),number=1;
while(true){folder=fso.BuildPath(downloads,base+(number===1?'':' ('+number+')'));if(fso.FolderExists(folder)||fso.FileExists(folder)){number++;continue;}try{fso.CreateFolder(folder);break;}catch(error){if((error.number&65535)===58){number++;continue;}throw error;}}
var system=fso.BuildPath(shell.Environment('Process').Item('SystemRoot'),'System32'),tar=fso.BuildPath(system,'tar.exe'),cscript=fso.BuildPath(system,'cscript.exe');
fso.CopyFile(zip,fso.BuildPath(folder,'TeachHelper-Archiv.zip'),false);shell.CurrentDirectory=folder;
if(shell.Run(q+tar+q+' -xf TeachHelper-Archiv.zip',0,true)===0){}else{throw new Error('ZIP konnte nicht entpackt werden.');}
var code=shell.Run(q+cscript+q+' //nologo //E:JScript //t:3600 ${WINDOWS_SCRIPT_NAME}',1,true);
shell.CurrentDirectory=previous;
if(code===0){}else{var log=fso.BuildPath(folder,'TeachHelper-Druckfehler.txt'),details='';if(fso.FileExists(log)){var stream=fso.OpenTextFile(log,1,false,-1);details=stream.ReadAll();stream.Close();}throw new Error(details+' Druck abgebrochen oder fehlgeschlagen (Code '+code+').');}
fso.DeleteFile(fso.BuildPath(folder,'${WINDOWS_SCRIPT_NAME}'),true);fso.DeleteFile(fso.BuildPath(folder,'${MACOS_SCRIPT_NAME}'),true);
fso.DeleteFile(fso.BuildPath(folder,'${MANIFEST_NAME}'),true);
fso.DeleteFile(fso.BuildPath(folder,'TeachHelper-Archiv.zip'),true);fso.DeleteFile(zip,true);WScript.Echo('Alle Druckauftraege uebergeben. ZIP-Datei, Druckskripte und Dateiliste geloescht.\nOrdner bleibt erhalten: '+folder);
}catch(error){shell.CurrentDirectory=previous;WScript.Echo('FEHLER: '+error.message+'\nZIP: '+zip+'\nOrdner: '+folder+'\nVerbliebene Dateien bleiben fuer die Wiederherstellung erhalten.');WScript.Quit(1);}`.replace(/\r?\n/g, " ");
}

function buildWindowsCommand(batchId, folderName) {
  const launcherPath = `%TEMP%\\TeachHelper-EWH-${batchId}.js`;
  const launcher = buildWindowsLauncher(batchId, folderName).replace(/[\^&|<>()]/g, "^$&");
  const command = `echo ${launcher}>"${launcherPath}" && cscript //nologo //E:JScript "${launcherPath}" && del "${launcherPath}" && exit`;
  if (command.length >= 8191) throw new Error("Der Windows-Druckbefehl ist zu lang.");
  return command;
}

function buildWindowsScript(batchId, fileNames) {
  return String.raw`var batchId=${asciiJson(batchId)},fileNames=${asciiJson(fileNames)};
var fso=new ActiveXObject("Scripting.FileSystemObject"),root=fso.GetParentFolderName(WScript.ScriptFullName),word=null,document=null,completed=0,current="",dialog=null;
function fail(message){throw new Error(message);}
function awaitPrinting(){
  var deadline=new Date().getTime()+300000;
  while(word.BackgroundPrintingStatus>0){
    if(new Date().getTime()>deadline)fail("Word hat die Druckauftraege nicht innerhalb von 5 Minuten uebergeben.");
    WScript.Sleep(200);
  }
}
function readManifest(){
  var stream=new ActiveXObject("ADODB.Stream");
  try{stream.Type=2;stream.Charset="utf-8";stream.Open();stream.LoadFromFile(fso.BuildPath(root,"${MANIFEST_NAME}"));return stream.ReadText(-1).replace(/^\uFEFF/,"");}
  finally{stream.Close();}
}
function selectDefaultPrinter(){
  var printers=new Enumerator(GetObject("winmgmts:\\\\.\\root\\cimv2").ExecQuery("SELECT Name FROM Win32_Printer WHERE Default = True"));
  if(printers.atEnd())fail("Kein Standarddrucker eingerichtet.");
  var name=printers.item().Name;
  if(/Microsoft Print to PDF|Microsoft XPS Document Writer|OneNote/i.test(name))fail("Bitte einen Drucker statt einer Dateiausgabe als Standarddrucker einstellen.");
  var setup=word.Dialogs.Item(97);setup.Printer=name;setup.DoNotSetAsSysDefault=1;setup.Execute();
}
function useDefaultSettings(error){
  var code=error.number;
  if(code!==-2147352573&&code!==-2147352570&&(code&65535)!==438&&(code&65535)!==4605)throw error;
  WScript.Echo("Der einmalige Word-Druckdialog ist nicht verfuegbar: "+error.message);
  WScript.StdOut.Write("Gesamten Stapel mit Standarddruckereinstellungen drucken? [j/N] ");
  if(!/^j(?:a)?$/i.test(WScript.StdIn.ReadLine().replace(/^\s+|\s+$/g,"")))fail("Druck abgebrochen.");
  return null;
}
try{
  var expected="TeachHelper-EWH "+batchId+"\n"+fileNames.join("\n")+"\n";
  if(readManifest().replace(/\r\n/g,"\n")!==expected)fail("Die Dateiliste passt nicht zu diesem Export.");
  var actual={},actualCount=0,files=new Enumerator(fso.GetFolder(root).Files);
  for(;!files.atEnd();files.moveNext()){var file=files.item();if(/\.docx$/i.test(file.Name)){actual["$"+file.Name.toLowerCase()]=true;actualCount++;}}
  if(actualCount!==fileNames.length)fail("Der Export ist unvollstaendig oder enthaelt zusaetzliche DOCX-Dateien.");
  for(var index=0;index<fileNames.length;index++){
    if(!fso.FileExists(fso.BuildPath(root,fileNames[index]))||actual["$"+fileNames[index].toLowerCase()]!==true)fail("DOCX fehlt: "+fileNames[index]);
  }
  word=new ActiveXObject("Word.Application");word.AutomationSecurity=3;word.Visible=true;
  selectDefaultPrinter();
  for(var index=0;index<fileNames.length;index++){
    current=fileNames[index];WScript.Echo("Druck "+(index+1)+"/"+fileNames.length+": "+current);
    document=word.Documents.Open(fso.BuildPath(root,current),false,true,false);document.Activate();
    if(index===0){
      try{dialog=word.Dialogs.Item(88);}
      catch(error){dialog=useDefaultSettings(error);}
      if(dialog!==null){
        var result;
        try{result=dialog.Display();}
        catch(error){dialog=useDefaultSettings(error);}
        if(dialog!==null){
          if(result!==-1)fail("Druck abgebrochen.");
          if(dialog.PrintToFile)fail("Dateiausgabe wird fuer den Stapeldruck nicht unterstuetzt.");
          if(dialog.DuplexPrint)fail("Manueller Duplexdruck benoetigt weitere Bestaetigungen. Bitte automatischen Duplexdruck oder einseitigen Druck waehlen.");
        }
      }
    }
    if(dialog!==null){
      try{dialog.Background=0;dialog.FileName=document.FullName;dialog.Execute();}
      catch(error){
        var code=error.number;
        if(completed!==0||(code!==-2147352573&&code!==-2147352570&&(code&65535)!==438))throw error;
        dialog=useDefaultSettings(error);
      }
    }
    if(dialog===null){document.PrintOut(false,false,0,"","","",0,1,"",0,false,true);}
    awaitPrinting();completed++;document.Close(0);document=null;
  }
  word.Quit(0);word=null;WScript.Echo(completed+" Druckauftraege erfolgreich uebergeben.");
}catch(error){
  var message="FEHLER bei "+(current||"Vorbereitung")+": "+error.message+"\n"+completed+" von "+fileNames.length+" Auftraegen uebergeben.\nOrdner: "+root+"\nDateien bleiben erhalten. Bei Wiederholung sind doppelte Ausdrucke moeglich.";
  WScript.Echo(message);
  try{var log=fso.CreateTextFile(fso.BuildPath(root,"TeachHelper-Druckfehler.txt"),true,true);log.Write(message);log.Close();}catch(logError){}
  try{if(document!==null)document.Close(0);}catch(closeError){}
  try{if(word!==null)word.Quit(0);}catch(quitError){}
  WScript.Quit(1);
}`;
}

function buildMacosScript(batchId, fileNames) {
  const expectedNames = `{${fileNames.map(quoteAppleScript).join(", ")}}`;
  const dialogSource = `script wordPrintDialog
  property storedDialog : missing value
  on configureDialog()
    tell application "Microsoft Word"
      set my storedDialog to get dialog dialog file print
      return display Word dialog (my storedDialog)
    end tell
  end configureDialog
  on printDocument(theDocument)
    tell application "Microsoft Word"
      activate object theDocument
      execute dialog (my storedDialog)
    end tell
  end printDocument
end script
return wordPrintDialog`;
  return `on loadPrintDialog()
  return run script ${quoteAppleScript(dialogSource)}
end loadPrintDialog

on waitForPrinting()
  set deadline to (current date) + 300
  tell application "Microsoft Word"
    repeat while background printing status > 0
      if (current date) > deadline then error "Word hat die Druckaufträge nicht innerhalb von 5 Minuten übergeben."
      delay 0.2
    end repeat
  end tell
end waitForPrinting

on closeStartedWord(wordWasStarted)
  if not wordWasStarted then return
  if not (application "Microsoft Word" is running) then return
  with timeout of 30 seconds
    tell application "Microsoft Word"
      if (count documents) is not 0 then return
      quit saving ask
    end tell
  end timeout
  set deadline to (current date) + 30
  repeat while application "Microsoft Word" is running
    if (current date) > deadline then error "Word wurde nicht innerhalb von 30 Sekunden beendet."
    delay 0.2
  end repeat
end closeStartedWord

on run arguments
  set rootPath to item 1 of arguments
  set expectedNames to ${expectedNames}
  set completed to 0
  set currentName to "Vorbereitung"
  set ownedDocument to missing value
  set dialogAutomation to missing value
  set defaultMode to false
  set wordWasStarted to false
  set shutdownAttempted to false
  try
    set manifestPath to POSIX file (rootPath & "/${MANIFEST_NAME}")
    set manifestText to read manifestPath as «class utf8»
    set manifestLines to paragraphs of manifestText
    if item 1 of manifestLines is not ${quoteAppleScript(`TeachHelper-EWH ${batchId}`)} then error "Die Dateiliste passt nicht zu diesem Export."
    set listedNames to items 2 thru -2 of manifestLines
    if listedNames is not expectedNames then error "Die Dateiliste ist unvollständig oder wurde verändert."
    set actualCount to do shell script "/usr/bin/find " & quoted form of rootPath & " -type f -iname '*.docx' | /usr/bin/wc -l"
    if (actualCount as integer) is not (count expectedNames) then error "Der Export ist unvollständig oder enthält zusätzliche DOCX-Dateien."
    repeat with fileName in expectedNames
      set documentPath to POSIX file (rootPath & "/" & fileName) as alias
    end repeat
    set printerStatus to do shell script "LC_ALL=C /usr/bin/lpstat -d"
    if printerStatus does not start with "system default destination: " then error "Kein Standarddrucker eingerichtet."
    set defaultPrinter to text 29 thru -1 of printerStatus
    set wordWasStarted to not (application "Microsoft Word" is running)
    tell application "Microsoft Word"
      activate
      set active printer to defaultPrinter
      repeat with fileName in expectedNames
        set currentName to fileName as text
        set documentPath to POSIX file (rootPath & "/" & currentName) as alias
        with timeout of 600 seconds
          open documentPath
          set ownedDocument to active document
          activate object ownedDocument
          log ("Druck " & (completed + 1) & "/" & (count expectedNames) & ": " & currentName)
          if completed is 0 then
            try
              set dialogAutomation to my loadPrintDialog()
              set dialogResult to dialogAutomation's configureDialog()
            on error dialogError number dialogCode
              if dialogCode is not -1708 and dialogCode is not -1728 and dialogCode is not -10006 and dialogCode is not -2740 and dialogCode is not -2741 and dialogCode is not -2753 then error dialogError number dialogCode
              set defaultMode to true
              set dialogAutomation to missing value
            end try
            if defaultMode then
              set answer to display dialog "Der einmalige Word-Druckdialog ist nicht verfügbar. Gesamten Stapel mit Standarddruckereinstellungen drucken?" buttons {"Abbrechen", "Drucken"} default button "Drucken" cancel button "Abbrechen"
            else
              if dialogResult is not -1 then error "Druck abgebrochen." number -128
            end if
          end if
          if defaultMode then
            print out ownedDocument background false print out range print all document print copies 1 without print to file
          else
            try
              dialogAutomation's printDocument(ownedDocument)
            on error printError number printCode
              if completed is not 0 then error printError number printCode
              if printCode is not -1708 and printCode is not -1728 and printCode is not -10006 then error printError number printCode
              display dialog "Die Word-Dialogsteuerung unterstützt den Stapeldruck nicht. Gesamten Stapel mit Standarddruckereinstellungen drucken?" buttons {"Abbrechen", "Drucken"} default button "Drucken" cancel button "Abbrechen"
              set defaultMode to true
              print out ownedDocument background false print out range print all document print copies 1 without print to file
            end try
          end if
          my waitForPrinting()
          set completed to completed + 1
          close ownedDocument saving no
          set ownedDocument to missing value
        end timeout
      end repeat
    end tell
    set shutdownAttempted to true
    try
      my closeStartedWord(wordWasStarted)
    on error shutdownMessage number shutdownCode
      error "Word konnte nach dem Druck nicht beendet werden: " & shutdownMessage number shutdownCode
    end try
    return (completed as text) & " Druckaufträge erfolgreich übergeben."
  on error errorMessage number errorCode
    if ownedDocument is not missing value and (application "Microsoft Word" is running) then
      try
        tell application "Microsoft Word" to close ownedDocument saving no
      end try
    end if
    if not shutdownAttempted then
      try
        my closeStartedWord(wordWasStarted)
      on error shutdownMessage
        set errorMessage to errorMessage & return & "Word konnte nach dem Abbruch nicht beendet werden: " & shutdownMessage
      end try
    end if
    error "FEHLER bei " & currentName & ": " & errorMessage & return & completed & " von " & (count expectedNames) & " Aufträgen übergeben." & return & "Ordner: " & rootPath & return & "Dateien bleiben erhalten. Bei Wiederholung sind doppelte Ausdrucke möglich." number errorCode
  end try
end run
`;
}

function buildMacosCommand(batchId, folderName) {
  const encodedFolderName = globalThis.btoa(String.fromCharCode(...new TextEncoder().encode(folderName)));
  const script = `set -eu
zip=''
folder=''
trap 'printf "\\nFEHLER: Druck oder Bereinigung fehlgeschlagen.\\nZIP: %s\\nOrdner: %s\\nVerbliebene Dateien bleiben erhalten.\\n" "$zip" "$folder" >&2' 0
downloads=$(/usr/bin/osascript -e 'POSIX path of (path to downloads folder)')
count=0
for candidate in "$downloads"*; do
  [ -f "$candidate" ] || continue
  name=${'$'}{candidate##*/}
  if printf '%s\\n' "$name" | /usr/bin/grep -Eq -- '-TH-EWH-${batchId}( \\([0-9]+\\))?\\.zip$'; then zip=$candidate; count=$((count+1)); fi
done
[ "$count" -eq 1 ] || { printf 'ZIP nicht eindeutig gefunden (%s Treffer). Download abwarten und genau ein ZIP dieses Exports im Download-Ordner behalten. Safari darf ZIP-Dateien nicht automatisch entpacken.\\n' "$count" >&2; exit 1; }
folderBase=$(printf '%s' '${encodedFolderName}' | /usr/bin/base64 -D)
folder="${'$'}{downloads}${'$'}{folderBase}"
number=1
while ! /bin/mkdir "$folder" 2>/dev/null; do
  [ -e "$folder" ] || [ -L "$folder" ] || { printf 'Ordner konnte nicht angelegt werden: %s\\n' "$folder" >&2; exit 1; }
  number=$((number+1))
  folder="${'$'}{downloads}${'$'}{folderBase} ($number)"
done
/usr/bin/ditto -x -k "$zip" "$folder"
/usr/bin/osascript "$folder/${MACOS_SCRIPT_NAME}" "$folder"
/bin/rm -- "$folder/${WINDOWS_SCRIPT_NAME}" "$folder/${MACOS_SCRIPT_NAME}"
/bin/rm -- "$folder/${MANIFEST_NAME}"
/bin/rm -- "$zip"
trap - 0
printf 'Alle Druckaufträge übergeben. ZIP-Datei, Druckskripte und Dateiliste gelöscht.\\nOrdner bleibt erhalten: %s\\n' "$folder"`;
  return `/bin/sh -c ${quoteShell(script.replace(/do\n/g, "do ").replace(/\n/g, "; "))} && exit`;
}

export function createExpectationHorizonPrintBundle({
  zipFileName = "Erwartungshorizonte.zip",
  folderName = "KA-Kurs-unbekannt-1-unbekannt",
  fileNames,
  platform = detectExpectationHorizonPrintPlatform(),
  batchId = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")
} = {}) {
  if (!/^[a-f0-9]{32}$/.test(batchId)) throw new Error("Ungültige Druckexport-ID.");
  if (typeof folderName !== "string" || !folderName.trim() || folderName === "." || folderName === ".."
    || /[<>:"/\\|?*\x00-\x1f\x7f]|[. ]$/.test(folderName)
    || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(folderName)
    || new TextEncoder().encode(folderName).length > 240) {
    throw new Error("Unzulässiger Ordnername für den Druckexport.");
  }
  if (!Array.isArray(fileNames) || !fileNames.length) throw new Error("Keine DOCX-Dateien für den Druck vorhanden.");
  const seen = new Set();
  for (const name of fileNames) {
    if (typeof name !== "string" || !/\.docx$/i.test(name) || /[<>:"/\\|?*\x00-\x1f\x7f]/.test(name)
      || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(name)) {
      throw new Error("Unzulässiger DOCX-Dateiname für den Druckexport.");
    }
    const key = name.normalize("NFC").toLowerCase();
    if (seen.has(key)) throw new Error("Doppelte DOCX-Dateinamen im Druckexport.");
    seen.add(key);
  }
  const encoder = new TextEncoder();
  return {
    batchId,
    platform,
    folderName,
    zipFileName: `${String(zipFileName).replace(/\.zip$/i, "")}-TH-EWH-${batchId}.zip`,
    command: platform === "windows" ? buildWindowsCommand(batchId, folderName) : platform === "macos" ? buildMacosCommand(batchId, folderName) : "",
    helperFiles: [
      { name: WINDOWS_SCRIPT_NAME, data: encoder.encode(buildWindowsScript(batchId, fileNames)) },
      { name: MACOS_SCRIPT_NAME, data: encoder.encode(buildMacosScript(batchId, fileNames)) },
      { name: MANIFEST_NAME, data: encoder.encode(`TeachHelper-EWH ${batchId}\n${fileNames.join("\n")}\n`) }
    ]
  };
}
