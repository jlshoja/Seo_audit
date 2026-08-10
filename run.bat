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
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found.
    echo.
    pause
    exit /b 1
)

REM --- Install Python deps if needed ---
echo Checking Python dependencies...
python -c "import requests, bs4, lxml" >nul 2>&1
if errorlevel 1 (
    echo Installing Python packages (requests, beautifulsoup4, lxml)...
    pip install -r crawler\requirements.txt --quiet
    if errorlevel 1 (
        echo ERROR: Failed to install Python packages.
        echo.
        pause
        exit /b 1
    )
)

REM --- Check Lighthouse availability ---
echo Checking Lighthouse availability...
node -e "const fs=require('fs');const paths=['node_modules/lighthouse','GT Metrix Made By Me/workers/test-runner/node_modules/lighthouse','GT Metrix Made By Me/node_modules/lighthouse'];const found=paths.filter(p=>fs.existsSync(p));if(found.length===0){console.error('lighthouse not found');process.exit(1)};console.log('lighthouse found at: '+found[0]);" 2>nul
if errorlevel 1 (
    echo Installing Node packages (lighthouse, chrome-launcher)...
    npm install lighthouse chrome-launcher --no-fund --no-audit 2>&1 | findstr /v "npm WARN"
    if errorlevel 1 (
        echo ERROR: Failed to install Lighthouse. Please check your internet connection.
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Select audit mode:
echo   1) Full Audit (Crawl + Speed + Combined Report)
echo   2) Crawl Only (Technical SEO)
echo   3) Speed Only (Core Web Vitals)
echo   4) Single Page Speed Check
echo.
set /p "choice=Enter choice [1-4]: "
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

REM Default: Full Audit
echo ============================================================
echo  RUNNING FULL SITE AUDIT
echo ============================================================
echo.

echo [1/4] Running Technical SEO Crawl...
python crawler\seo_audit.py --config config.json --output crawler\crawl_results.json
if errorlevel 1 (
    echo Crawl failed. Check errors above.
    goto end_script
)

echo.
echo [2/4] Running Core Web Vitals Speed Audit...
node speed\seo-speed-audit.js --config config.json --output speed\speed_results.json
if errorlevel 1 (
    echo Speed audit failed. Check errors above.
    goto end_script
)

echo.
echo [3/4] Merging results and building unified report...
node report\merge-report.js --config config.json --crawl crawler\crawl_results.json --speed speed\speed_results.json --output reports
if errorlevel 1 (
    echo Report generation failed. Check errors above.
    goto end_script
)

echo.
echo [4/4] Done!
echo Reports saved to: reports\
dir /b reports\*.html 2>nul
goto end_script

:run_crawl_only
echo ============================================================
echo  RUNNING TECHNICAL SEO CRAWL ONLY
echo ============================================================
echo.
python crawler\seo_audit.py --config config.json --output crawler\crawl_results.json --report-only
if errorlevel 1 (
    echo Crawl failed.
    goto end_script
)
echo Done! Check crawler\crawl_results.json and crawler\seo_issues_*.csv
goto end_script

:run_speed_only
echo ============================================================
echo  RUNNING CORE WEB VITALS SPEED AUDIT ONLY
echo ============================================================
echo.
node speed\seo-speed-audit.js --config config.json --output speed\speed_results.json
if errorlevel 1 (
    echo Speed audit failed.
    goto end_script
)
echo Done! Check speed\speed_results.json
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
node speed\seo-speed-audit.js --url "%url%" --device %device% --audit full --output speed\speed_results.json
if errorlevel 1 (
    echo Single page test failed.
    goto end_script
)
echo Done! Check speed\speed_results.json

:end_script
echo.
echo ============================================================
pause