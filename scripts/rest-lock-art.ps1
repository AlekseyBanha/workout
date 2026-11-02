Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::FromArgb(255, 7, 8, 11))
$lime = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 214, 255, 74))
$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 7, 8, 11))
$g.FillEllipse($lime, 76, 20, 360, 360)
$g.FillEllipse($ink, 168, 176, 64, 64)
$g.FillEllipse($ink, 280, 176, 64, 64)
$g.FillRectangle($ink, 216, 198, 80, 20)
$label = -join @(
  [char]0x0412, [char]0x0456, [char]0x0434, [char]0x043F, [char]0x043E,
  [char]0x0447, [char]0x0438, [char]0x043D, [char]0x043E, [char]0x043A
)
$font = New-Object System.Drawing.Font "Segoe UI", 46, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF 0, 400, 512, 96
$g.DrawString($label, $font, $lime, $rect, $format)
$path = Join-Path $PSScriptRoot "..\public\rest-lock.png"
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output $path
