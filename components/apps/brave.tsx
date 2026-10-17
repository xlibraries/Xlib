// @ts-nocheck
import React, { Component } from 'react';

export class Brave extends Component {
    constructor() {
        super();
        this.home_url = 'https://www.google.com/webhp?igu=1';
        this.state = {
            url: 'https://www.google.com/webhp?igu=1',
            display_url: "https://www.google.com",
        }
    }

    componentDidMount() {
        let lastVisitedUrl = localStorage.getItem("brave-url");
        let lastDisplayedUrl = localStorage.getItem("brave-display-url");
        if (lastVisitedUrl !== null && lastVisitedUrl !== undefined) {
            this.setState({ url: lastVisitedUrl, display_url: lastDisplayedUrl }, this.refreshBrave);
        }
    }

    storeVisitedUrl = (url, display_url) => {
        localStorage.setItem("brave-url", url);
        localStorage.setItem("brave-display-url", display_url);
    }

    refreshBrave = () => {
        document.getElementById("brave-screen").src += '';
    }

    goToHome = () => {
        this.setState({ url: this.home_url, display_url: "https://www.google.com" });
        this.refreshBrave();
    }

    checkKey = (e) => {
        if (e.key === "Enter") {
            let url = e.target.value;
            let display_url = "";

            url = url.trim();
            if (url.length === 0) return;

            if (url.indexOf("http://") !== 0 && url.indexOf("https://") !== 0) {
                url = "https://" + url;
            }

            url = encodeURI(url);
            display_url = url;
            if (url.includes("google.com")) { // 😅
                url = 'https://www.google.com/webhp?igu=1';
                display_url = "https://www.google.com";
            }
            this.setState({ url, display_url });
            this.storeVisitedUrl(url, display_url);
            document.getElementById("brave-url-bar").blur();
        }
    }

    handleDisplayUrl = (e) => {
        this.setState({ display_url: e.target.value });
    }

    displayUrlBar = () => {
        return (
            <div className="w-full pt-0.5 pb-1 flex justify-start items-center text-white text-sm border-b border-gray-900">
                <button type="button" onClick={this.refreshBrave} className=" ml-2 mr-1 flex justify-center items-center rounded-full bg-gray-50 bg-opacity-0 hover:bg-opacity-10 border-0 bg-transparent p-0">
                    <img className="w-5" src="./themes/Yaru/status/chrome_refresh.svg" alt="Ubuntu Brave Refresh" />
                </button>
                <button type="button" onClick={this.goToHome} className=" mr-2 ml-1 flex justify-center items-center rounded-full bg-gray-50 bg-opacity-0 hover:bg-opacity-10 border-0 bg-transparent p-0">
                    <img className="w-5" src="./themes/Yaru/status/chrome_home.svg" alt="Ubuntu Brave Home" />
                </button>
                <input onKeyDown={this.checkKey} onChange={this.handleDisplayUrl} value={this.state.display_url} id="brave-url-bar" className="outline-none bg-ub-grey rounded-full pl-3 py-0.5 mr-3 w-5/6 text-gray-300 focus:text-white" type="url" spellCheck={false} autoComplete="off" />
            </div>
        );
    }

    render() {
        return (
            <div className="h-full w-full flex flex-col bg-ub-cool-grey">
                {this.displayUrlBar()}
                <iframe src={this.state.url} className="flex-grow" id="brave-screen" frameBorder="0" title="Ubuntu Brave Url"></iframe>
            </div>
        )
    }
}

export default Brave

export const displayBrave = () => {
    return <Brave> </Brave>;
}
