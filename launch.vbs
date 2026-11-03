Set WshShell = CreateObject("WScript.Shell")

' تشغيل السيرفر في الخلفية بشكل مخفي تماماً
WshShell.Run "cmd /c node server.js", 0, False

' الانتظار 3 ثوانٍ لضمان إقلاع السيرفر
Wscript.Sleep 3000

' فتح المتصفح تلقائياً على النظام
WshShell.Run "http://localhost:4000"