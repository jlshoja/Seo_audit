@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo  SEO Audit Pro - Integrated Site Auditor
echo ============================================================
echo.

REM --- Check that config.json exists ---
if not exist "config.json" (
    echo ERROR: config.json not found!
    echo Please create config.json with your site configuration.
    echo.
    pause
    exit /b 1
)

REM --- Check Python ---
where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://python.org
    echo.
    pause
    exit /b 1
)

REM --- Check Node.js ---
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM --- Check npm ---
REM npm.cmd on some systems swallows the rest of a batch file, so
REM npm is always invoked through a nested cmd.exe to isolate it.
cmd /c "npm --version" >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found.
    echo.
    pause
    exit /b 1
)

REM --- Create the results folder ---
if not exist "reports" mkdir "reports"

REM --- Install Python deps if needed ---
echo Checking Python dependencies...
python -c "import requests, bs4, lxml" >nul 2>&1
if errorlevel 1 (
    echo Installing Python packages: requests, beautifulsoup4, lxml...
    cmd /c "pip install -r src\crawler\requirements.txt --quiet"
    if errorlevel 1 (
        echo ERROR: Failed to install Python packages.
        echo.
        pause
        exit /b 1
    )
)

REM --- Install Node deps (lighthouse, chrome-launcher) if needed ---
echo Checking Lighthouse availability...
if exist "node_modules\lighthouse" (
    echo Lighthouse found.
) else (
    echo Installing Node packages: lighthouse, chrome-launcher, chart.js...
    cmd /c "npm install --no-fund --no-audit"
    if errorlevel 1 (
        echo ERROR: Failed to install Node packages. Please check your internet connection.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Select audit mode:
echo   1) Full Audit (Crawl + Speed + Combined Report + AI Prompt)
echo   2) Crawl Only (Technical SEO)
echo   3) Speed Only (Core Web Vitals)
echo   4) Single Page Speed Check
echo   5) AI Analysis (build prompt from latest results)
echo.
set /p "choice=Enter choice [1-5]: "
echo.

if "%choice%"=="2" (
    goto run_crawl_only
)
if "%choice%"=="3" (
    goto run_speed_only
)
if "%choice%"=="4" (
    goto run_single_page
)
if "%choice%"=="5" (
    goto run_ai_only
)

REM Default: Full Audit
echo ============================================================
echo  RUNNING FULL SITE AUDIT
echo ============================================================
echo.

echo [1/4] Running Technical SEO Crawl...
python src\crawler\seo_audit.py --config config.json --cwd reports --output crawl_results.json
if errorlevel 1 (
    echo Crawl failed. Check errors above.
    goto end_script
)

echo.
echo [2/4] Running Core Web Vitals Speed Audit...
node src\speed\seo-speed-audit.js --config config.json --output reports\speed_results.json
if errorlevel 1 (
    echo Speed audit failed. Check errors above.
    goto end_script
)

echo.
echo [3/4] Merging results and building unified report...
node src\report\merge-report.js --config config.json --crawl reports\crawl_results.json --speed reports\speed_results.json --output reports
if errorlevel 1 (
    echo Report generation failed. Check errors above.
    goto end_script
)

echo.
echo [4/4] Building AI analysis prompt...
node src\ai\analyze.js --config config.json
echo.
echo Done! Reports saved to: reports\
dir /b reports\*.html 2>nul
goto end_script

:run_crawl_only
echo ============================================================
echo  RUNNING TECHNICAL SEO CRAWL ONLY
echo ============================================================
echo.
python src\crawler\seo_audit.py --config config.json --cwd reports --output crawl_results.json
if errorlevel 1 (
    echo Crawl failed.
    goto end_script
)
echo Done! Check reports\crawl_results.json and reports\seo_issues_*.csv
goto end_script

:run_speed_only
echo ============================================================
echo  RUNNING CORE WEB VITALS SPEED AUDIT ONLY
echo ============================================================
echo.
node src\speed\seo-speed-audit.js --config config.json --output reports\speed_results.json
if errorlevel 1 (
    echo Speed audit failed.
    goto end_script
)
echo Done! Check reports\speed_results.json
goto end_script

:run_single_page
set /p "url=Enter URL to test: "
if "%url%"=="" (
    echo No URL entered.
    goto end_script
)
echo Select device:
echo   1) Mobile
echo   2) Desktop
set /p "deviceChoice=Enter choice [1-2]: "
if "%deviceChoice%"=="2" (set device=desktop) else (set device=mobile)
echo.
node src\speed\seo-speed-audit.js --url "%url%" --device %device% --audit full --output reports\speed_results.json
if errorlevel 1 (
    echo Single page test failed.
    goto end_script
)
echo Done! Check reports\speed_results.json

:run_ai_only
echo ============================================================
echo  BUILDING AI ANALYSIS PROMPT
echo ============================================================
echo.
node src\ai\analyze.js --config config.json
if errorlevel 1 (
    echo AI analysis failed. Run an audit first, mode 1-3.
    goto end_script
)
echo.
echo Done! Open the generated reports\ai-prompt-*.md and paste it into your AI.
goto end_script

:end_script
echo.
echo ============================================================
pause
