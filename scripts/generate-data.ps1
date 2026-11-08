param(
    [string]$Workbook = (Join-Path $PSScriptRoot '..\assets\factory-supplier pair.xlsx'),
    [string]$Assignments = (Join-Path $PSScriptRoot '..\assets\assignments.xlsx'),
    [string]$Output = (Join-Path $PSScriptRoot '..\data\supplier-factories.js')
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

# Returns one hashtable per data row (header row skipped), keyed by column letter.
function Read-SheetRows([string]$Path) {
    $archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Path).Path)
    try {
        $readXml = {
            param([string]$Name)
            $entry = $archive.GetEntry($Name)
            if (-not $entry) { throw "Missing workbook entry in ${Path}: $Name" }
            $reader = [System.IO.StreamReader]::new($entry.Open())
            try { [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
        }
        $namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
        $stringsXml = & $readXml 'xl/sharedStrings.xml'
        $sheetXml = & $readXml 'xl/worksheets/sheet1.xml'

        $stringManager = [System.Xml.XmlNamespaceManager]::new($stringsXml.NameTable)
        $stringManager.AddNamespace('x', $namespace)
        $sharedStrings = @(
            $stringsXml.SelectNodes('//x:si', $stringManager) | ForEach-Object {
                (($_.SelectNodes('.//x:t', $stringManager) | ForEach-Object InnerText) -join '')
            }
        )

        $sheetManager = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
        $sheetManager.AddNamespace('x', $namespace)
        foreach ($row in $sheetXml.SelectNodes('//x:sheetData/x:row[position() > 1]', $sheetManager)) {
            $values = @{}
            foreach ($cell in $row.SelectNodes('./x:c', $sheetManager)) {
                $column = ([regex]::Match($cell.r, '^[A-Z]+')).Value
                $valueNode = $cell.SelectSingleNode('./x:v', $sheetManager)
                $inlineNode = $cell.SelectSingleNode('./x:is', $sheetManager)
                $values[$column] = if ($cell.t -eq 's') { $sharedStrings[[int]$valueNode.InnerText] }
                    elseif ($inlineNode) { $inlineNode.InnerText }
                    elseif ($valueNode) { $valueNode.InnerText }
                    else { $null }
            }
            $values
        }
    }
    finally { $archive.Dispose() }
}

$rows = foreach ($values in Read-SheetRows $Workbook) {
    if ($values.A -and $values.B -and $values.C -and $values.D) {
        [pscustomobject]@{
            supplierCode = [string]$values.A
            supplierName = [string]$values.B
            factoryCode  = [string]$values.C
            factoryName  = [string]$values.D
        }
    }
}

$suppliers = @(
    $rows |
        Group-Object supplierCode |
        ForEach-Object {
            $first = $_.Group[0]
            [pscustomobject][ordered]@{
                code = $first.supplierCode
                name = $first.supplierName
                factories = @(
                    $_.Group |
                        Group-Object factoryCode |
                        ForEach-Object {
                            [pscustomobject][ordered]@{
                                code = $_.Group[0].factoryCode
                                name = $_.Group[0].factoryName
                            }
                        } |
                        Sort-Object name
                )
            }
        } |
        Sort-Object name
)

# Assignments workbook: A Factory Code, B Factory Name, C Primary Allocation, D Allocation %, E Shared With.
# Allocation percentages are ignored: a factory shared between packaging suppliers belongs to each of them.
$packagingNames = [ordered]@{
    'Epyllion'   = 'Epyllion Ltd.'
    'MR'         = 'MR Box'
    'Reflex'     = 'Reflex Packaging Ltd.'
    'Uniglory'   = 'Uniglory Packaging Industries Ltd.'
    'Union'      = 'Union Label & Accessories Ltd.'
    'Youngshine' = 'Youngshine Packtrims Ltd.'
}
$packagingFactories = [ordered]@{}
foreach ($name in $packagingNames.Values) { $packagingFactories[$name] = [System.Collections.Generic.List[string]]::new() }

$factoryList = foreach ($values in Read-SheetRows $Assignments) {
    if (-not ($values.A -and $values.B)) { continue }
    $code = [string]$values.A
    $allocations = @([string]$values.C) + @(([string]$values.E) -split ',')
    foreach ($allocation in $allocations) {
        $short = ([regex]::Match($allocation.Trim(), '^[A-Za-z]+')).Value
        if (-not $short) { continue }
        if (-not $packagingNames.Contains($short)) { throw "Unknown packaging supplier '$short' for factory $code" }
        $list = $packagingFactories[$packagingNames[$short]]
        if (-not $list.Contains($code)) { $list.Add($code) }
    }
    [pscustomobject][ordered]@{ code = $code; name = ([string]$values.B).Trim() }
}
$factoryList = @($factoryList | Sort-Object name)

$outputDirectory = Split-Path -Parent $Output
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
$supplierJson = $suppliers | ConvertTo-Json -Depth 6
$factoryJson = ConvertTo-Json -InputObject $factoryList -Depth 3
$packagingJson = $packagingFactories | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText(
    [System.IO.Path]::GetFullPath($Output),
    "// Generated from assets/factory-supplier pair.xlsx and assets/assignments.xlsx. Do not edit manually.`nwindow.SUPPLIER_FACTORY_DATA = $supplierJson;`nwindow.FACTORY_LIST = $factoryJson;`nwindow.PACKAGING_FACTORIES = $packagingJson;`n",
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Generated $($suppliers.Count) suppliers, $($rows.Count) supplier-factory pairs and $($factoryList.Count) packaging-assigned factories in $Output"
