const InspectionDate = (() => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok', calendar: 'gregory', numberingSystem: 'latn',
        year: 'numeric', month: '2-digit', day: '2-digit'
    });

    function today(now = new Date()) {
        const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
        return [parts.year, parts.month, parts.day].join('-');
    }

    function parse(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
        if (!match) return null;
        const [year, month, day] = match.slice(1).map(Number);
        const check = new Date(Date.UTC(year, month - 1, day));
        if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
        return { year, month, day };
    }

    return { today, parse };
})();
