package org.sample.fargate.rds.efs.test;

import javax.inject.Singleton;
import javax.ws.rs.GET;
import javax.ws.rs.Path;

import javax.naming.*;
import javax.sql.*;
import java.sql.*;

/**
 * Attempt to connect to Postgres database using credentials provided through the environment
 */
@Path("/db")
@Singleton
public class DbController {

    @GET
    public String response() {

        try (
            Connection conn = DriverManager.getConnection("jdbc:postgresql://"+System.getenv("DB_HOST")+":"+System.getenv("DB_PORT")+"/"+System.getenv("DB_NAME"), System.getenv("DB_USER"), System.getenv("DB_PASSWORD"));
            Statement stmt = conn.createStatement();
            ResultSet rs = stmt.executeQuery("SELECT 1");
        ) {

            return "Connected to DB";

        } catch (SQLException e) {

            e.printStackTrace();
            return "Failed connection to DB";
            
        } 

    }
}
