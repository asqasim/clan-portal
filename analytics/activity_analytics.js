
(function() {

    const SCRIPT_URL =
        "https://script.google.com/macros/s/AKfycbxe28MJFJ6PyDJqg0-DMT-RdFIUQcctcFrNOBzlVvCSX_pb0OoYztzWvN5mcHB7iPkP/exec";


    /*
    ============================================================
    VISIT ID
    ============================================================
    */

    let visitId = sessionStorage.getItem("gs_visit_id");

    if (!visitId) {

        visitId =
            "v_" +
            Math.random().toString(36).substring(2, 11) +
            "_" +
            Date.now();

        sessionStorage.setItem("gs_visit_id", visitId);
    }


    /*
    ============================================================
    SEND DATA TO GOOGLE APPS SCRIPT
    ============================================================
    */

    function sendData(payload) {

        payload.visitId = visitId;
        payload.pageUrl = window.location.href;

        fetch(SCRIPT_URL, {

            method: "POST",

            mode: "no-cors",

            headers: {
                "Content-Type": "text/plain"
            },

            body: JSON.stringify(payload)

        }).catch(error => {

            console.error("Tracking Error:", error);

        });
    }


    /*
    ============================================================
    DEVICE
    ============================================================
    */

    function getDeviceType() {

        const ua = navigator.userAgent;

        if (
            /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i
            .test(ua)
        ) {
            return "Tablet";
        }

        if (
            /Mobile|iPhone|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/i
            .test(ua)
        ) {
            return "Mobile";
        }

        return "Desktop";
    }


    /*
    ============================================================
    BROWSER
    ============================================================
    */

    function getBrowser() {

        const ua = navigator.userAgent;

        if (ua.includes("Firefox"))
            return "Firefox";

        if (ua.includes("SamsungBrowser"))
            return "Samsung Internet";

        if (ua.includes("Opera") || ua.includes("OPR"))
            return "Opera";

        if (ua.includes("Trident"))
            return "Internet Explorer";

        if (ua.includes("Edge") || ua.includes("Edg"))
            return "Edge";

        if (ua.includes("Chrome"))
            return "Chrome";

        if (ua.includes("Safari"))
            return "Safari";

        return "Unknown";
    }


    /*
    ============================================================
    OS
    ============================================================
    */

    function getOS() {

        const platform =
            navigator.userAgentData?.platform ||
            navigator.platform;

        if (platform.includes("Win"))
            return "Windows";

        if (platform.includes("Mac"))
            return "macOS";

        if (platform.includes("Linux"))
            return "Linux";

        if (/Android/i.test(navigator.userAgent))
            return "Android";

        if (/iPhone|iPad|iPod/i.test(navigator.userAgent))
            return "iOS";

        return "Unknown";
    }


    /*
    ============================================================
    IP + LOCATION
    ============================================================
    */

    async function getGeoData() {

        /*
        ----------------------------------------
        Service 1: ipapi.co
        ----------------------------------------
        */

        try {

            const response =
                await fetch("https://ipapi.co/json/");

            if (response.ok) {

                const data = await response.json();

                if (data.ip) {

                    return {
                        ip: data.ip || "Unknown",
                        country: data.country_name || "Unknown",
                        city: data.city || "Unknown"
                    };

                }

            }

        } catch (error) {

            console.warn("ipapi.co failed");

        }


        /*
        ----------------------------------------
        Service 2: ipwho.is
        ----------------------------------------
        */

        try {

            const response =
                await fetch("https://ipwho.is/");

            if (response.ok) {

                const data = await response.json();

                if (data.success && data.ip) {

                    return {
                        ip: data.ip || "Unknown",
                        country: data.country || "Unknown",
                        city: data.city || "Unknown"
                    };

                }

            }

        } catch (error) {

            console.warn("ipwho.is failed");

        }


        /*
        ----------------------------------------
        Service 3: ip-api.com
        ----------------------------------------
        */

        try {

            const response =
                await fetch(
                    "https://ip-api.com/json/?fields=status,country,city,query"
                );

            if (response.ok) {

                const data = await response.json();

                if (data.status === "success" && data.query) {

                    return {
                        ip: data.query || "Unknown",
                        country: data.country || "Unknown",
                        city: data.city || "Unknown"
                    };

                }

            }

        } catch (error) {

            console.warn("ip-api.com failed");

        }


        /*
        ----------------------------------------
        Everything failed
        ----------------------------------------
        */

        return {
            ip: "Unknown",
            country: "Unknown",
            city: "Unknown"
        };
    }


    /*
    ============================================================
    RECORD VISIT
    ============================================================
    */

    async function recordVisit() {

        // Start with Unknown.
        // This means visitor registration doesn't depend
        // on the IP services working.

        let geo = {
            ip: "Unknown",
            country: "Unknown",
            city: "Unknown"
        };


        // Try to obtain IP/location.

        try {

            geo = await getGeoData();

        } catch (error) {

            console.warn("All geo services failed");

        }


        // Send visitor regardless of geo result.

        sendData({

            type: "visit",

            ip: geo.ip,

            country: geo.country,

            city: geo.city,

            browser: getBrowser(),

            os: getOS(),

            device: getDeviceType(),

            screenRes:
                `${window.screen.width}x${window.screen.height}`,

            referrer:
                document.referrer || "Direct"
        });

    }


    /*
    ============================================================
    CLICK ANALYTICS
    ============================================================
    */

    document.addEventListener("click", function(event) {

        const target =
            event.target.closest("[gs_tracker]");

        if (!target)
            return;


        const trackerName =
            target.getAttribute("gs_tracker");


        sendData({

            type: "activity",

            trackerName: trackerName

        });

    });


    /*
    ============================================================
    MODAL
    ============================================================
    */

    const modal =
        document.getElementById("modal");


    document.addEventListener("click", function(event) {

        const tracker =
            event.target.closest("[gs_tracker]");

        if (!tracker)
            return;


        const name =
            tracker.getAttribute("gs_tracker");


        if (name === "open_modal") {

            modal.style.display = "flex";

        }


        if (name === "close_modal") {

            modal.style.display = "none";

        }

    });


    /*
    ============================================================
    START VISITOR TRACKING
    ============================================================
    */

    recordVisit();

})();

