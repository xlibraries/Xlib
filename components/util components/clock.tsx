// @ts-nocheck
import { Component } from 'react'

export default class Clock extends Component {
    constructor() {
        super();
        this.month_list = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        this.day_list = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        this.state = {
            hour_12: true,
            // set after mount: a time rendered on the server never matches the browser's (hydration error)
            current_time: null
        };
    }

    componentDidMount() {
        this.setState({ current_time: new Date() });
        this.update_time = setInterval(() => {
            this.setState({ current_time: new Date() });
        }, 10 * 1000);
    }

    componentWillUnmount() {
        clearInterval(this.update_time);
    }

    render() {
        const { current_time } = this.state;
        if (!current_time) return <span>&nbsp;</span>;

        const day = this.day_list[current_time.getDay()];
        let hour = current_time.getHours();
        let minute = current_time.getMinutes();
        const month = this.month_list[current_time.getMonth()];
        const date = current_time.getDate().toLocaleString();
        const meridiem = (hour < 12 ? "AM" : "PM");

        if (minute.toLocaleString().length === 1) {
            minute = "0" + minute
        }

        if (this.state.hour_12) hour = hour % 12 || 12;

        let display_time;
        if (this.props.onlyTime) {
            display_time = hour + ":" + minute + " " + meridiem;
        }
        else if (this.props.onlyDay) {
            display_time = day + " " + month + " " + date;
        }
        else display_time = day + " " + month + " " + date + " " + hour + ":" + minute + " " + meridiem;
        return <span>{display_time}</span>;
    }
}
