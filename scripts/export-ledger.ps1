param(
  [string]$WorkbookPath = "C:\Users\Anirudh\Documents\Portfolio\anirudh-ledger-workbook-v2.xlsx",
  [string]$OutPath = "C:\Users\Anirudh\Documents\New project\data\ledger-data.js"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-EntryText($zip, $name) {
  $entry = $zip.GetEntry($name)
  if (-not $entry) { return $null }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Close() }
}

function Get-SharedStrings($zip) {
  $text = Get-EntryText $zip "xl/sharedStrings.xml"
  if (-not $text) { return @() }
  [xml]$shared = $text
  $items = @()
  foreach ($si in $shared.sst.si) { $items += $si.InnerText }
  return $items
}

function Get-ColName($cellRef) {
  return ($cellRef -replace "\d", "")
}

function Get-CellValue($cell, $sharedStrings) {
  $type = $cell.t
  $value = $cell.v
  if ($null -eq $value -and $null -eq $cell.is) { return "" }
  if ($type -eq "s") { return $sharedStrings[[int]$value] }
  if ($type -eq "inlineStr") { return $cell.is.InnerText }
  return [string]$value
}

function Read-Sheet($zip, $sharedStrings, $sheetPath, $headerRow = 1) {
  [xml]$sheet = Get-EntryText $zip $sheetPath
  $rows = @($sheet.worksheet.sheetData.row)
  $headerXml = $rows | Where-Object { [int]$_.r -eq $headerRow } | Select-Object -First 1
  $headers = @{}
  foreach ($cell in $headerXml.c) {
    $headers[(Get-ColName $cell.r)] = (Get-CellValue $cell $sharedStrings).Trim()
  }

  $records = @()
  foreach ($row in $rows | Where-Object { [int]$_.r -gt $headerRow }) {
    $record = [ordered]@{}
    foreach ($cell in $row.c) {
      $header = $headers[(Get-ColName $cell.r)]
      if ($header) { $record[$header] = (Get-CellValue $cell $sharedStrings).Trim() }
    }

    $hasContent = $false
    foreach ($value in $record.Values) {
      if (-not [string]::IsNullOrWhiteSpace([string]$value)) {
        $hasContent = $true
        break
      }
    }
    if ($hasContent) { $records += [PSCustomObject]$record }
  }
  return $records
}

function Convert-Year($value) {
  if ([string]::IsNullOrWhiteSpace([string]$value)) { return $null }
  return [int][double]$value
}

function Convert-Money($value) {
  if ([string]::IsNullOrWhiteSpace([string]$value)) { return $null }
  return [double]$value
}

function Get-DateParts($record) {
  $year = Convert-Year $record.Year
  $month = $null
  if (-not [string]::IsNullOrWhiteSpace([string]$record.Month)) {
    $month = [int][double]$record.Month
  }

  $date = [string]$record.Date
  if ($date -match "^(\d{4})-(\d{1,2})-(\d{1,2})") {
    return @{ year = [int]$matches[1]; month = [int]$matches[2]; day = [int]$matches[3]; precision = "day" }
  }
  if ($date -match "^(\d{4})-(\d{1,2})$") {
    return @{ year = [int]$matches[1]; month = [int]$matches[2]; day = 15; precision = "month" }
  }
  if ($year -and $month) {
    return @{ year = $year; month = $month; day = 15; precision = "month" }
  }
  if ($year) {
    return @{ year = $year; month = 7; day = 1; precision = "year" }
  }
  return $null
}

function Get-WeekKey($dateParts) {
  if (-not $dateParts) { return $null }
  $date = Get-Date -Year $dateParts.year -Month $dateParts.month -Day $dateParts.day -Hour 12
  $culture = [System.Globalization.CultureInfo]::InvariantCulture
  $week = $culture.Calendar.GetWeekOfYear($date, [System.Globalization.CalendarWeekRule]::FirstFourDayWeek, [DayOfWeek]::Monday)
  if ($week -gt 53) { $week = 53 }
  return ("{0}-W{1:00}" -f $date.Year, $week)
}

function Split-Tags($text) {
  if ([string]::IsNullOrWhiteSpace([string]$text)) { return @() }
  return @($text -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($WorkbookPath)
try {
  $shared = Get-SharedStrings $zip
  $masterRaw = Read-Sheet $zip $shared "xl/worksheets/sheet2.xml" 1
  $emailRaw = Read-Sheet $zip $shared "xl/worksheets/sheet3.xml" 4
  $rolesRaw = Read-Sheet $zip $shared "xl/worksheets/sheet5.xml" 1
  $filmsRaw = Read-Sheet $zip $shared "xl/worksheets/sheet6.xml" 1
  $earningsRaw = Read-Sheet $zip $shared "xl/worksheets/sheet7.xml" 1
  $peopleRaw = Read-Sheet $zip $shared "xl/worksheets/sheet8.xml" 1
  $firstsRaw = Read-Sheet $zip $shared "xl/worksheets/sheet9.xml" 1

  $entries = @()
  foreach ($row in $masterRaw) {
    $parts = Get-DateParts $row
    if (-not $parts -or $parts.year -lt 2009) { continue }
    if ([string]::IsNullOrWhiteSpace([string]$row.Title) -and [string]::IsNullOrWhiteSpace([string]$row.Description)) { continue }

    $tags = @()
    $tags += Split-Tags $row."Role Tags"
    foreach ($field in @("Activity Type", "Identity Tag", "Role", "Era Name", "Status")) {
      if (-not [string]::IsNullOrWhiteSpace([string]$row.$field)) { $tags += [string]$row.$field }
    }
    $tags = @($tags | Where-Object { $_ } | Select-Object -Unique)

    $entries += [PSCustomObject][ordered]@{
      id = [int][double]$row.ID
      year = $parts.year
      month = $parts.month
      day = $parts.day
      precision = $parts.precision
      weekKey = Get-WeekKey $parts
      date = [string]$row.Date
      era = [string]$row."Era Name"
      activityType = [string]$row."Activity Type"
      title = [string]$row.Title
      role = [string]$row.Role
      org = [string]$row."Org/Client"
      location = [string]$row.Location
      description = [string]$row.Description
      evidenceSource = [string]$row."Evidence Source"
      evidenceDetail = [string]$row."Evidence Detail"
      earningsAmount = Convert-Money $row."Earnings Amount"
      currency = [string]$row.Currency
      identityTag = [string]$row."Identity Tag"
      status = [string]$row.Status
      roleTags = Split-Tags $row."Role Tags"
      tags = $tags
      notes = [string]$row.Notes
    }
  }

  $weeklyEmailCounts = @{}
  foreach ($email in $emailRaw) {
    $parts = Get-DateParts $email
    if (-not $parts -or $parts.year -lt 2009) { continue }
    $key = Get-WeekKey $parts
    if (-not $weeklyEmailCounts.ContainsKey($key)) { $weeklyEmailCounts[$key] = 0 }
    $weeklyEmailCounts[$key] += 1
  }

  $tags = @()
  foreach ($entry in $entries) { $tags += $entry.tags }
  $tagCounts = @()
  foreach ($group in ($tags | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending)) {
    $tagCounts += [PSCustomObject]@{ name = $group.Name; count = $group.Count }
  }

  $data = [PSCustomObject][ordered]@{
    generatedAt = (Get-Date).ToString("s")
    sourceWorkbook = $WorkbookPath
    yearStart = 2009
    yearEnd = 2026
    entries = $entries
    weeklyEmailCounts = $weeklyEmailCounts
    tags = $tagCounts
    roles = $rolesRaw
    films = $filmsRaw
    earnings = $earningsRaw
    people = $peopleRaw
    firsts = $firstsRaw
  }

  $json = $data | ConvertTo-Json -Depth 8 -Compress
  $outDir = Split-Path $OutPath -Parent
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
  "window.LEDGER_DATA = $json;" | Set-Content -LiteralPath $OutPath -Encoding UTF8
  Write-Host "Exported $($entries.Count) archive entries and $($weeklyEmailCounts.Count) weekly email buckets to $OutPath"
}
finally {
  $zip.Dispose()
}
